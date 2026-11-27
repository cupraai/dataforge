"""Edit one audio file in place from its original; NR and pitch come from the preview's proxy."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from pathlib import Path

from audio_effects import (
    AudioProbe,
    audio_proxy,
    check_audio_filters,
    eq_filters,
    is_effects_identity,
    needs_proxy,
    probe_audio,
)
from audio_info import audio_duration
from audio_level import MEASURE_FILTER, audio_level_filters, parse_loudness
from constants import AUDIO_COVER_MUXERS, AUDIO_EDIT_MUXERS
from edit_sidecars import (
    begin_edit,
    publish_with_spec,
    read_spec,
    restore_backup,
    temp_path_for,
)
from ffmpeg_bin import require_ffmpeg
from ffmpeg_run import FFMPEG_QUIET_ARGS, ProgressCallback, ShouldCancel, run_ffmpeg
from file_publish import unlink_quietly
from media_claims import claim
from schemas import AudioEditResponse, AudioEditSpec
from video_edit import IDENTITY_EPSILON, atempo_chain
from video_project_render import FADE_CURVES

logger = logging.getLogger(__name__)

FFMPEG_MISSING_MESSAGE = "ffmpeg is required to edit audio"
AUDIO_EDIT_TIMEOUT_SECONDS = 1800

#: LAME's constant rates; a source's average snaps to the nearest.
MP3_BITRATES = (32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320)
#: LAME's high-quality variable rate, when the source reports no bitrate.
MP3_FALLBACK_QUALITY = "2"
#: The usual AAC rates. A source's average rounds up to one: easy sound undershoots its target.
AAC_BITRATES = (32, 48, 64, 96, 128, 160, 192, 256, 320)
#: Hard sound lands a little over its target, which must not round up a whole step.
AAC_OVERSHOOT = 1.05
#: The rest are for sources that report no bitrate.
AAC_FALLBACK_KBPS = 192
OPUS_FALLBACK_KBPS = 128
#: libvorbis's variable quality, about 192 kb/s.
VORBIS_FALLBACK_QUALITY = "6"


def read_audio_edit_spec(media: Path) -> AudioEditSpec | None:
    return read_spec(media, AudioEditSpec)


def is_identity_spec(spec: AudioEditSpec) -> bool:
    return (
        spec.trim_start < IDENTITY_EPSILON
        and spec.trim_end is None
        and spec.fade_in < IDENTITY_EPSILON
        and spec.fade_out < IDENTITY_EPSILON
        and abs(spec.volume - 1.0) < IDENTITY_EPSILON
        and spec.level == "unchanged"
        and abs(spec.speed - 1.0) < IDENTITY_EPSILON
        and spec.pitch == 0
        and is_effects_identity(spec.effects)
    )


def resolve_muxer(media: Path) -> str:
    muxer = AUDIO_EDIT_MUXERS.get(media.suffix.lower())
    if muxer is None:
        raise ValueError(f"{media.suffix} audio cannot be edited")
    return muxer


def expected_output_seconds(spec: AudioEditSpec, source_seconds: float | None) -> float | None:
    end = spec.trim_end if spec.trim_end is not None else source_seconds
    if end is None:
        return None
    return max(0.0, end - spec.trim_start) / spec.speed


def _seconds(value: float) -> str:
    return f"{value:.6f}"


def build_audio_filters(
    spec: AudioEditSpec, output_seconds: float | None, *, level: list[str] | None = None
) -> list[str]:
    """Trim, then speed, EQ, volume and fades; ``level=None`` stops before the level stage."""
    filters: list[str] = []
    if spec.trim_start > 0 or spec.trim_end is not None:
        bounds = [f"start={_seconds(spec.trim_start)}"]
        if spec.trim_end is not None:
            bounds.append(f"end={_seconds(spec.trim_end)}")
        filters += [f"atrim={':'.join(bounds)}", "asetpts=PTS-STARTPTS"]
    if abs(spec.speed - 1.0) > IDENTITY_EPSILON:
        filters.append(atempo_chain(spec.speed))
    filters += eq_filters(spec.effects)
    if abs(spec.volume - 1.0) > IDENTITY_EPSILON:
        filters.append(f"volume={spec.volume:.6f}")
    curve = FADE_CURVES[spec.fade_curve]
    if spec.fade_in > IDENTITY_EPSILON:
        filters.append(f"afade=t=in:st=0:d={_seconds(spec.fade_in)}:curve={curve}")
    if spec.fade_out > IDENTITY_EPSILON:
        if output_seconds is None:
            raise ValueError("The sound's length could not be read, so it cannot fade out")
        start = max(0.0, output_seconds - spec.fade_out)
        filters.append(
            f"afade=t=out:st={_seconds(start)}:d={_seconds(spec.fade_out)}:curve={curve}"
        )
    return [*filters, *(level or [])]


def _nearest_mp3_bitrate(kbps: int) -> int:
    return min(MP3_BITRATES, key=lambda rate: abs(rate - kbps))


def _bitrate(probe: AudioProbe, fallback: int) -> list[str]:
    return ["-b:a", f"{probe.kbps or fallback}k"]


def _aac_bitrate(probe: AudioProbe) -> list[str]:
    if not probe.kbps:
        return ["-b:a", f"{AAC_FALLBACK_KBPS}k"]
    target = probe.kbps / AAC_OVERSHOOT
    rate = next((rate for rate in AAC_BITRATES if rate >= target), AAC_BITRATES[-1])
    return ["-b:a", f"{rate}k"]


def encoder_arguments(muxer: str, probe: AudioProbe) -> list[str]:
    """The source's own encoding, as near as the encoder allows."""
    rate = ["-ar", str(probe.sample_rate)] if probe.sample_rate else []
    if muxer == "wav":
        codec = probe.codec if probe.codec and probe.codec.startswith("pcm_") else "pcm_s16le"
        return ["-c:a", codec, *rate]
    if muxer == "flac" or (muxer == "ogg" and probe.codec == "flac"):
        sample_format = "s16" if probe.sample_format == "s16" else "s32"
        return ["-c:a", "flac", "-sample_fmt", sample_format, *rate]
    if muxer == "adts":
        # ADTS has no tag block of its own.
        return ["-c:a", "aac", *_aac_bitrate(probe), *rate, "-write_id3v2", "1"]
    if muxer == "ipod":
        lossless = probe.codec == "alac"
        codec = ["-c:a", "alac"] if lossless else ["-c:a", "aac", *_aac_bitrate(probe)]
        return [*codec, *rate, "-movflags", "+faststart"]
    if muxer == "ogg":
        if probe.codec == "opus":
            return ["-c:a", "libopus", *_bitrate(probe, OPUS_FALLBACK_KBPS), *rate]
        quality = ["-b:a", f"{probe.kbps}k"] if probe.kbps else ["-q:a", VORBIS_FALLBACK_QUALITY]
        return ["-c:a", "libvorbis", *quality, *rate]
    if probe.kbps:
        quality = ["-b:a", f"{_nearest_mp3_bitrate(probe.kbps)}k"]
    else:
        quality = ["-q:a", MP3_FALLBACK_QUALITY]
    return ["-c:a", "libmp3lame", *quality, *rate, "-id3v2_version", "3"]


def build_audio_edit_command(
    source: Path,
    destination: Path,
    filters: list[str],
    *,
    executable: str,
    muxer: str,
    probe: AudioProbe,
    tagged: Path,
) -> list[str]:
    """``tagged`` is the original, whose tags and cover go on even when ``source`` is a proxy."""
    command = [
        *(executable, *FFMPEG_QUIET_ARGS),
        *("-progress", "pipe:1", "-y", "-i", str(source)),
    ]
    tags = 0
    if tagged != source:
        command += ["-i", str(tagged)]
        tags = 1
    command += ["-map", "0:a:0", "-map_metadata", str(tags)]
    if muxer in AUDIO_COVER_MUXERS and probe.has_picture:
        command += ["-map", f"{tags}:v?", "-c:v", "copy", "-disposition:v", "attached_pic"]
    if filters:
        command += ["-af", ",".join(filters)]
    command += encoder_arguments(muxer, probe)
    command += ["-f", muxer, str(destination)]
    return command


def build_measure_command(executable: str, source: Path, filters: list[str]) -> list[str]:
    return [
        *(executable, "-nostdin", "-hide_banner", "-nostats", "-loglevel", "info"),
        *("-i", str(source), "-map", "0:a:0", "-af", ",".join([*filters, MEASURE_FILTER])),
        *("-f", "null", "-"),
    ]


def _render_source(executable: str, original: Path, spec: AudioEditSpec) -> Path:
    if needs_proxy(spec.effects.noise_reduction, spec.pitch):
        return audio_proxy(
            executable, original, noise_reduction=spec.effects.noise_reduction, pitch=spec.pitch
        )
    return original


def measure_loudness(
    original: Path, spec: AudioEditSpec, *, ffmpeg: str | None = None
) -> float | None:
    """Integrated LUFS before the level stage; ``None`` for silence."""
    executable = require_ffmpeg(ffmpeg, FFMPEG_MISSING_MESSAGE)
    source = _render_source(executable, original, spec)
    probe = probe_audio(executable, original)
    output_seconds = expected_output_seconds(spec, probe.duration)
    log = run_ffmpeg(
        build_measure_command(executable, source, build_audio_filters(spec, output_seconds)),
        timeout=AUDIO_EDIT_TIMEOUT_SECONDS,
    )
    loudness = parse_loudness(log)
    if loudness is None or loudness.integrated_lufs == float("-inf"):
        return None
    return loudness.integrated_lufs


def describe_edited(
    media: Path, *, has_backup: bool, replaced_externally: bool = False
) -> AudioEditResponse:
    stat = media.stat()
    return AudioEditResponse(
        path=str(media),
        size=stat.st_size,
        modified_at=datetime.fromtimestamp(stat.st_mtime, tz=UTC).isoformat(),
        duration=audio_duration(media),
        has_backup=has_backup,
        replaced_externally=replaced_externally,
    )


def apply_audio_edit(
    media: Path,
    spec: AudioEditSpec,
    *,
    ffmpeg: str | None = None,
    on_progress: ProgressCallback | None = None,
    should_cancel: ShouldCancel | None = None,
) -> AudioEditResponse:
    """Render ``spec`` from the original; on failure the live file is untouched."""
    with claim([media], "render") as held:
        return _apply_claimed(
            media,
            spec,
            ffmpeg=ffmpeg,
            on_progress=on_progress,
            should_cancel=held.cancel_check(should_cancel),
        )


def _apply_claimed(
    media: Path,
    spec: AudioEditSpec,
    *,
    ffmpeg: str | None,
    on_progress: ProgressCallback | None,
    should_cancel: ShouldCancel,
) -> AudioEditResponse:
    executable = require_ffmpeg(ffmpeg, FFMPEG_MISSING_MESSAGE)

    muxer = resolve_muxer(media)
    check_audio_filters(executable, spec.effects, pitch=spec.pitch)

    start = begin_edit(media)
    original = start.source
    probe = probe_audio(executable, original)
    if probe.sample_rate is None:
        raise ValueError(f"{media.name} has no sound that ffmpeg can read")
    output_seconds = expected_output_seconds(spec, probe.duration)
    if (
        output_seconds is not None
        and spec.fade_in + spec.fade_out > output_seconds + IDENTITY_EPSILON
    ):
        raise ValueError("The fades cannot be longer than the sound they shape")

    source = _render_source(executable, original, spec)
    measured = None
    if spec.level == "normalize":
        measured = measure_loudness(original, spec, ffmpeg=executable)
    filters = build_audio_filters(
        spec,
        output_seconds,
        level=audio_level_filters(spec.level, measured, probe.sample_rate),
    )
    temp_path = temp_path_for(media)
    command = build_audio_edit_command(
        source,
        temp_path,
        filters,
        executable=executable,
        muxer=muxer,
        probe=probe,
        tagged=original,
    )

    try:
        run_ffmpeg(
            command,
            should_cancel=should_cancel,
            on_progress=on_progress,
            timeout=AUDIO_EDIT_TIMEOUT_SECONDS,
        )
        publish_with_spec(temp_path, media, spec)
    finally:
        unlink_quietly(temp_path)

    return describe_edited(media, has_backup=True, replaced_externally=start.adopted)


def revert_audio_edit(media: Path) -> AudioEditResponse:
    with claim([media], "render"):
        reverted = restore_backup(media)
    return describe_edited(media, has_backup=False, replaced_externally=not reverted)
