from __future__ import annotations

import re
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch

import mutagen
import numpy as np
from pydantic import ValidationError

import audio_edit
import edit_sidecars
from audio_effects import AudioProbe, probe_audio
from audio_level import build_file_measure, parse_loudness
from constants import VIDEO_PROJECT_LOUDNESS_TARGET_LUFS
from ffmpeg_bin import ffmpeg_path
from ffmpeg_run import run_ffmpeg
from schemas import AudioEditSpec, AudioEffects, VideoEditSpec
from testing_fixtures import (
    CacheFolderTestCase,
    TempMediaFolder,
    write_edit_spec,
    write_mp4_video,
)


def ffmpeg() -> str:
    executable = ffmpeg_path()
    assert executable
    return executable


def generate(root: Path, name: str, *arguments: str) -> Path:
    media = root / name
    subprocess.run(
        [ffmpeg(), "-v", "error", "-y", *arguments, str(media)], check=True, capture_output=True
    )
    return media


def tone(root: Path, name: str, *output: str, seconds: float = 3.0, amplitude: float = 0.1):
    return generate(
        root,
        name,
        *("-f", "lavfi", "-i", f"aevalsrc={amplitude}*sin(2*PI*440*t):s=44100:d={seconds}"),
        *output,
    )


def tags_of(media: Path) -> dict[str, str]:
    """What ffmpeg reads back, for containers mutagen has no tag reader for."""
    summary = subprocess.run(
        [ffmpeg(), "-hide_banner", "-i", str(media)], capture_output=True, check=False
    ).stderr.decode("utf-8", errors="replace")
    pairs = re.findall(r"^\s+(\w+)\s*: (.+)$", summary, re.MULTILINE)
    return {key.lower(): value.strip() for key, value in pairs}


def tail_rms(media: Path, seconds: float, rate: int = 44100) -> float:
    """Decoded whole: ``-sseof`` cannot seek in a file that stores no length."""
    decoded = subprocess.run(
        [
            ffmpeg(),
            "-v",
            "error",
            "-i",
            str(media),
            "-ac",
            "1",
            "-ar",
            str(rate),
            "-f",
            "f32le",
            "-",
        ],
        capture_output=True,
        check=True,
    ).stdout
    tail = np.frombuffer(decoded, dtype="<f4")[-round(seconds * rate) :].astype(np.float64)
    return float(np.sqrt(np.mean(tail**2)))


class SpecTests(unittest.TestCase):
    def test_a_same_stem_video_edit_is_not_read_as_an_audio_edit(self) -> None:
        with TempMediaFolder() as root:
            video = write_mp4_video(root, "clip.mp4")
            write_edit_spec(video, VideoEditSpec(trim_start=1.0, volume=0.5))

            self.assertIsNone(audio_edit.read_audio_edit_spec(root / "clip.wav"))

    def test_fades_longer_than_the_kept_sound_are_refused(self) -> None:
        with self.assertRaises(ValidationError):
            AudioEditSpec(trim_start=1, trim_end=2, speed=2, fade_in=0.3, fade_out=0.3)
        AudioEditSpec(trim_start=1, trim_end=2, speed=2, fade_in=0.25, fade_out=0.25)

    def test_a_cut_outside_its_range_is_refused(self) -> None:
        with self.assertRaises(ValidationError):
            AudioEffects(low_cut=5)
        with self.assertRaises(ValidationError):
            AudioEffects(high_cut=900)

    def test_only_a_change_counts_as_an_edit(self) -> None:
        self.assertTrue(audio_edit.is_identity_spec(AudioEditSpec()))
        for change in (
            {"trim_start": 0.5},
            {"fade_out": 1.0},
            {"volume": 0.5},
            {"level": "limit"},
            {"speed": 1.5},
            {"pitch": -2},
            {"effects": AudioEffects(bass=3)},
        ):
            with self.subTest(change=change):
                self.assertFalse(audio_edit.is_identity_spec(AudioEditSpec(**change)))


class FilterTests(unittest.TestCase):
    def test_trim_runs_in_source_time_and_fades_in_output_time(self) -> None:
        spec = AudioEditSpec(
            trim_start=1,
            trim_end=5,
            speed=2,
            volume=1.5,
            fade_in=0.5,
            fade_out=1,
            effects=AudioEffects(mid=3),
        )
        filters = audio_edit.build_audio_filters(spec, audio_edit.expected_output_seconds(spec, 9))

        self.assertEqual(
            [name.partition("=")[0] for name in filters],
            ["atrim", "asetpts", "atempo", "equalizer", "volume", "afade", "afade"],
        )
        self.assertEqual(filters[0], "atrim=start=1.000000:end=5.000000")
        # Four source seconds at double speed are two output seconds: the fade starts at one.
        self.assertIn("st=1.000000:d=1.000000", filters[-1])
        self.assertIn("curve=qsin", filters[-1])

    def test_an_untrimmed_fade_out_ends_with_the_file(self) -> None:
        spec = AudioEditSpec(fade_out=2, fade_curve="linear")
        filters = audio_edit.build_audio_filters(spec, audio_edit.expected_output_seconds(spec, 10))
        self.assertEqual(filters, ["afade=t=out:st=8.000000:d=2.000000:curve=tri"])

    def test_the_level_stage_comes_last(self) -> None:
        filters = audio_edit.build_audio_filters(
            AudioEditSpec(volume=0.5), 3, level=["alimiter=limit=0.9"]
        )
        self.assertEqual(filters, ["volume=0.500000", "alimiter=limit=0.9"])


class EncoderTests(unittest.TestCase):
    def test_a_wav_keeps_its_sample_format(self) -> None:
        arguments = audio_edit.encoder_arguments(
            "wav", AudioProbe(codec="pcm_f32le", sample_rate=96000)
        )
        self.assertEqual(arguments, ["-c:a", "pcm_f32le", "-ar", "96000"])

    def test_a_flac_keeps_sixteen_bits_or_writes_twenty_four(self) -> None:
        self.assertIn("s16", audio_edit.encoder_arguments("flac", AudioProbe(sample_format="s16")))
        self.assertIn("s32", audio_edit.encoder_arguments("flac", AudioProbe(sample_format="s32")))

    def test_an_mp3_snaps_its_bitrate_to_one_lame_can_write(self) -> None:
        arguments = audio_edit.encoder_arguments("mp3", AudioProbe(kbps=187))
        self.assertEqual(arguments[arguments.index("-b:a") + 1], "192k")
        fallback = audio_edit.encoder_arguments("mp3", AudioProbe())
        self.assertIn("-q:a", fallback)

    def test_an_aac_keeps_its_bitrate_and_writes_its_tags_as_id3(self) -> None:
        arguments = audio_edit.encoder_arguments("adts", AudioProbe(codec="aac", kbps=105))
        self.assertEqual(arguments[:4], ["-c:a", "aac", "-b:a", "128k"])
        self.assertEqual(arguments[-2:], ["-write_id3v2", "1"])
        fallback = audio_edit.encoder_arguments("adts", AudioProbe(codec="aac"))
        self.assertIn(f"{audio_edit.AAC_FALLBACK_KBPS}k", fallback)

    def test_an_m4a_stays_lossless_or_keeps_its_bitrate(self) -> None:
        alac = audio_edit.encoder_arguments("ipod", AudioProbe(codec="alac", kbps=900))
        self.assertEqual(alac[:2], ["-c:a", "alac"])
        self.assertNotIn("-b:a", alac)
        self.assertIn("128k", audio_edit.encoder_arguments("adts", AudioProbe(kbps=133)))
        aac = audio_edit.encoder_arguments("ipod", AudioProbe(codec="aac", kbps=250))
        self.assertEqual(aac[:4], ["-c:a", "aac", "-b:a", "256k"])
        self.assertIn("+faststart", aac)

    def test_an_ogg_keeps_its_codec(self) -> None:
        def codec(probe: AudioProbe) -> str:
            arguments = audio_edit.encoder_arguments("ogg", probe)
            return arguments[arguments.index("-c:a") + 1]

        self.assertEqual(codec(AudioProbe(codec="vorbis", kbps=112)), "libvorbis")
        self.assertEqual(codec(AudioProbe(codec="opus")), "libopus")
        self.assertEqual(codec(AudioProbe(codec="flac", sample_format="s16")), "flac")
        self.assertIn("-q:a", audio_edit.encoder_arguments("ogg", AudioProbe(codec="vorbis")))

    def test_only_containers_that_hold_a_cover_are_given_one(self) -> None:
        cases = {"mp3": True, "flac": True, "ipod": True, "ogg": False, "adts": False, "wav": False}
        for muxer, keeps in cases.items():
            with self.subTest(muxer=muxer):
                command = audio_edit.build_audio_edit_command(
                    Path("in"),
                    Path("out"),
                    [],
                    executable="ffmpeg",
                    muxer=muxer,
                    probe=AudioProbe(codec="aac", kbps=128, has_picture=True),
                    tagged=Path("in"),
                )
                self.assertEqual("0:v?" in command, keeps)

    def test_a_proxy_source_takes_its_tags_and_cover_from_the_original(self) -> None:
        command = audio_edit.build_audio_edit_command(
            Path("proxy.flac"),
            Path("out"),
            [],
            executable="ffmpeg",
            muxer="mp3",
            probe=AudioProbe(kbps=128, has_picture=True),
            tagged=Path("song.mp3.bak"),
        )
        joined = " ".join(command)
        self.assertIn("-i proxy.flac -i song.mp3.bak", joined)
        self.assertIn("-map 0:a:0 -map_metadata 1 -map 1:v? -c:v copy", joined)


class ApplyAudioEditTests(CacheFolderTestCase):
    """Real ffmpeg: what each format keeps, and that the original comes back."""

    def test_a_wav_is_trimmed_in_its_own_format_and_reverts_byte_identical(self) -> None:
        with TempMediaFolder() as root:
            media = tone(root, "voice.wav", "-c:a", "pcm_s24le")
            original = media.read_bytes()

            response = audio_edit.apply_audio_edit(
                media, AudioEditSpec(trim_start=0.5, trim_end=2.0, fade_in=0.2, fade_out=0.2)
            )

            self.assertTrue(response.has_backup)
            self.assertAlmostEqual(response.duration or 0, 1.5, delta=0.01)
            probe = probe_audio(ffmpeg(), media)
            self.assertEqual((probe.codec, probe.sample_rate), ("pcm_s24le", 44100))
            spec = audio_edit.read_audio_edit_spec(media)
            self.assertEqual(spec.trim_end if spec else None, 2.0)

            audio_edit.revert_audio_edit(media)
            self.assertEqual(media.read_bytes(), original)
            self.assertFalse(edit_sidecars.backup_path_for(media).exists())

    def test_a_re_edit_starts_from_the_original(self) -> None:
        with TempMediaFolder() as root:
            media = tone(root, "voice.wav")
            audio_edit.apply_audio_edit(media, AudioEditSpec(trim_end=1.0))
            response = audio_edit.apply_audio_edit(media, AudioEditSpec(trim_end=2.0))
            self.assertAlmostEqual(response.duration or 0, 2.0, delta=0.01)

    def test_a_flac_keeps_its_depth_and_its_tags(self) -> None:
        with TempMediaFolder() as root:
            media = tone(
                root, "take.flac", "-c:a", "flac", "-sample_fmt", "s32", "-metadata", "title=Take"
            )

            audio_edit.apply_audio_edit(media, AudioEditSpec(effects=AudioEffects(treble=3)))

            self.assertEqual(probe_audio(ffmpeg(), media).bits, 24)
            self.assertEqual(mutagen.File(media)["title"], ["Take"])

    def test_an_mp3_keeps_its_bitrate_and_tags(self) -> None:
        with TempMediaFolder() as root:
            media = tone(
                root, "song.mp3", "-c:a", "libmp3lame", "-b:a", "160k", "-metadata", "title=Song"
            )

            audio_edit.apply_audio_edit(media, AudioEditSpec(volume=0.5))

            self.assertEqual(probe_audio(ffmpeg(), media).kbps, 160)
            self.assertEqual(str(mutagen.File(media)["TIT2"]), "Song")

    def test_an_aac_keeps_its_bitrate_and_tags_and_reverts_byte_identical(self) -> None:
        with TempMediaFolder() as root:
            # Noise, so the encoder spends its whole budget; a tone undershoots it.
            media = generate(
                root,
                "song.aac",
                *("-f", "lavfi", "-i", "anoisesrc=d=3:r=44100:a=0.3"),
                *("-c:a", "aac", "-b:a", "128k", "-write_id3v2", "1", "-metadata", "title=Song"),
            )
            original = media.read_bytes()

            response = audio_edit.apply_audio_edit(media, AudioEditSpec(trim_end=2.0, volume=0.5))

            probe = probe_audio(ffmpeg(), media)
            self.assertEqual(probe.codec, "aac")
            self.assertAlmostEqual(probe.kbps or 0, 128, delta=8)
            self.assertAlmostEqual(response.duration or 0, 2.0, delta=0.05)
            self.assertEqual(tags_of(media).get("title"), "Song")

            audio_edit.revert_audio_edit(media)
            self.assertEqual(media.read_bytes(), original)

    def test_an_aac_fades_out_at_its_counted_end(self) -> None:
        """ffmpeg's bitrate guess puts this file's end minutes late, past any fade."""
        with TempMediaFolder() as root:
            media = generate(
                root,
                "speech.aac",
                *("-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=3"),
                *("-f", "lavfi", "-i", "anoisesrc=d=3:r=44100:a=0.5"),
                *("-filter_complex", "[0][1]concat=n=2:v=0:a=1", "-c:a", "aac", "-q:a", "2"),
            )
            loud = tail_rms(media, 0.2)

            audio_edit.apply_audio_edit(media, AudioEditSpec(fade_out=1.0))

            self.assertLess(tail_rms(media, 0.2), loud / 4)

    def test_an_m4a_keeps_its_cover_and_tags(self) -> None:
        with TempMediaFolder() as root:
            media = generate(
                root,
                "song.m4a",
                *("-f", "lavfi", "-i", "aevalsrc=0.1*sin(2*PI*440*t):s=44100:d=2"),
                *("-f", "lavfi", "-i", "color=red:s=32x32:d=1", "-map", "0:a", "-map", "1:v"),
                *("-c:a", "aac", "-b:a", "192k", "-c:v", "mjpeg", "-frames:v", "1"),
                *("-disposition:v", "attached_pic", "-metadata", "title=Song"),
            )

            audio_edit.apply_audio_edit(media, AudioEditSpec(volume=0.5))

            probe = probe_audio(ffmpeg(), media)
            self.assertEqual(probe.codec, "aac")
            self.assertTrue(probe.has_picture)
            self.assertEqual(mutagen.File(media)["\xa9nam"], ["Song"])

    def test_an_alac_m4a_stays_lossless(self) -> None:
        with TempMediaFolder() as root:
            media = tone(root, "take.m4a", "-c:a", "alac")

            audio_edit.apply_audio_edit(media, AudioEditSpec(volume=0.5))

            self.assertEqual(probe_audio(ffmpeg(), media).codec, "alac")

    def test_an_ogg_and_an_opus_keep_their_codec_and_tags(self) -> None:
        cases = (
            ("tone.ogg", ("-c:a", "libvorbis", "-b:a", "128k"), "vorbis"),
            ("voice.opus", ("-c:a", "libopus", "-b:a", "96k"), "opus"),
        )
        for name, encoding, codec in cases:
            with self.subTest(name=name), TempMediaFolder() as root:
                media = tone(root, name, *encoding, "-metadata", "title=Take")

                audio_edit.apply_audio_edit(media, AudioEditSpec(fade_in=0.5))

                self.assertEqual(probe_audio(ffmpeg(), media).codec, codec)
                self.assertEqual(mutagen.File(media)["title"], ["Take"])

    def test_normalize_brings_the_sound_to_the_target(self) -> None:
        with TempMediaFolder() as root:
            media = tone(root, "quiet.wav", amplitude=0.02)

            audio_edit.apply_audio_edit(media, AudioEditSpec(level="normalize"))

            loudness = parse_loudness(run_ffmpeg(build_file_measure(ffmpeg(), media)))
            assert loudness is not None
            self.assertAlmostEqual(
                loudness.integrated_lufs, VIDEO_PROJECT_LOUDNESS_TARGET_LUFS, delta=0.5
            )

    def test_noise_reduction_and_pitch_are_rendered_from_the_proxy(self) -> None:
        """The proxy is what the preview played, so the file must be made from the same one."""
        with TempMediaFolder() as root:
            media = tone(root, "voice.wav")
            with patch("audio_edit.audio_proxy", wraps=audio_edit.audio_proxy) as proxy:
                audio_edit.apply_audio_edit(
                    media, AudioEditSpec(pitch=2, effects=AudioEffects(noise_reduction=0.4))
                )

            proxy.assert_called_once()
            self.assertEqual(proxy.call_args.args[1], edit_sidecars.backup_path_for(media))
            self.assertEqual(proxy.call_args.kwargs, {"noise_reduction": 0.4, "pitch": 2})

    def test_a_failed_render_leaves_the_file_as_it_was(self) -> None:
        with TempMediaFolder() as root:
            media = tone(root, "voice.wav")
            before = media.read_bytes()
            with (
                patch("audio_edit.run_ffmpeg", side_effect=RuntimeError("boom")),
                self.assertRaises(RuntimeError),
            ):
                audio_edit.apply_audio_edit(media, AudioEditSpec(volume=0.5))

            self.assertEqual(media.read_bytes(), before)
            self.assertFalse(edit_sidecars.edit_spec_path(media).exists())


if __name__ == "__main__":
    unittest.main()
