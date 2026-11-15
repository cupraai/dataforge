from __future__ import annotations

from testing_fixtures import isolate_test_database

isolate_test_database()

import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch

from automation.trim_video import (
    AlreadyTrimmedError,
    run_trim_video_job,
    trimmed_spec,
    validate_trim_video_folder,
)
from edit_sidecars import backup_path_for, edit_spec_path
from ffmpeg_bin import ffmpeg_path
from ffmpeg_run import FfmpegCancelled
from schemas import EditCropRect, VideoEditSpec
from testing_fixtures import (
    TempMediaFolder,
    claimed_elsewhere,
    write_edit_backup,
    write_edit_spec,
    write_image,
    write_mp4_video,
)
from video_edit import SourceProbe, read_edit_spec, revert_video_edit

#: Ten seconds at 24 fps.
PROBE = SourceProbe(frame_rate=24.0, size=(640, 360), seconds=10.0)


def _trim(spec: VideoEditSpec, seconds: float, keep: str = "start", probe=PROBE) -> tuple:
    trimmed = trimmed_spec(spec, probe, seconds, keep)  # type: ignore[arg-type]
    return trimmed.trim_start, trimmed.trim_end


class TrimmedSpecTests(unittest.TestCase):
    def test_keeps_the_start(self) -> None:
        self.assertEqual(_trim(VideoEditSpec(), 4.0), (0.0, 4.0))

    def test_keeps_the_middle_on_a_frame_boundary(self) -> None:
        start, end = _trim(VideoEditSpec(), 4.0, "middle")
        self.assertEqual((start * 24, end * 24), (72, 168))

    def test_keeps_the_end(self) -> None:
        self.assertEqual(_trim(VideoEditSpec(), 4.0, "end"), (6.0, 10.0))

    def test_a_length_between_frames_keeps_only_whole_frames(self) -> None:
        start, end = _trim(VideoEditSpec(), 1.03)
        self.assertEqual((start, round(end * 24, 9)), (0.0, 24))

    def test_lengths_land_on_an_ntsc_grid(self) -> None:
        fps = 30000 / 1001
        probe = SourceProbe(frame_rate=fps, seconds=300 / fps)

        start, end = _trim(VideoEditSpec(), 5.0, "middle", probe)

        self.assertEqual(round(start * fps, 9), 75)
        self.assertEqual(round(end * fps, 9), 224)

    def test_the_length_is_measured_after_the_speed(self) -> None:
        self.assertEqual(_trim(VideoEditSpec(speed=2.0), 2.0), (0.0, 4.0))

    def test_a_manual_trim_is_shortened_from_inside(self) -> None:
        spec = VideoEditSpec(trim_start=1.0, trim_end=9.0, crop=EditCropRect(width=0.5))

        self.assertEqual(_trim(spec, 2.0), (1.0, 3.0))
        self.assertEqual(_trim(spec, 2.0, "end"), (7.0, 9.0))
        self.assertEqual(_trim(spec, 2.0, "middle"), (4.0, 6.0))
        self.assertEqual(trimmed_spec(spec, PROBE, 2.0, "start").crop, spec.crop)

    def test_a_video_already_short_enough_is_left_alone(self) -> None:
        with self.assertRaises(AlreadyTrimmedError):
            trimmed_spec(VideoEditSpec(), PROBE, 10.0, "start")
        with self.assertRaises(AlreadyTrimmedError):
            trimmed_spec(VideoEditSpec(trim_end=3.0), PROBE, 5.0, "end")

    def test_an_unreadable_rate_or_length_is_an_error(self) -> None:
        with self.assertRaisesRegex(ValueError, "frame rate"):
            trimmed_spec(VideoEditSpec(), SourceProbe(), 2.0, "start")
        with self.assertRaisesRegex(ValueError, "length"):
            trimmed_spec(VideoEditSpec(), SourceProbe(frame_rate=24.0), 2.0, "end")

    def test_a_trimmed_out_point_needs_no_length(self) -> None:
        probe = SourceProbe(frame_rate=24.0)

        self.assertEqual(_trim(VideoEditSpec(trim_end=6.0), 2.0, "end", probe), (4.0, 6.0))


@patch("automation.trim_video.probe_source", return_value=PROBE)
class TrimJobTests(unittest.TestCase):
    def test_stores_the_trim_and_renders_with_the_probe(self, probe) -> None:
        with TempMediaFolder() as root:
            media = write_mp4_video(root)
            write_edit_spec(media, VideoEditSpec(scale=0.5))

            with patch("automation.trim_video.apply_video_edit") as apply:
                result = run_trim_video_job(root, max_seconds=3.0, keep="end", ffmpeg="ffmpeg")

            self.assertEqual(result["stats"]["success"], 1)
            spec = apply.call_args.args[1]
            self.assertEqual((spec.trim_start, spec.trim_end, spec.scale), (7.0, 10.0, 0.5))
            self.assertIs(apply.call_args.kwargs["probe"], probe.return_value)

    def test_images_are_not_listed(self, _probe) -> None:
        with TempMediaFolder() as root:
            write_mp4_video(root)
            write_image(root, "still.png")

            with patch("automation.trim_video.apply_video_edit"):
                result = run_trim_video_job(root, max_seconds=3.0, ffmpeg="ffmpeg")

            self.assertEqual(result["stats"]["total"], 1)

    def test_a_short_video_is_counted_unchanged(self, _probe) -> None:
        with TempMediaFolder() as root:
            media = write_mp4_video(root)

            with patch("automation.trim_video.apply_video_edit") as apply:
                result = run_trim_video_job(root, max_seconds=20.0, ffmpeg="ffmpeg")

            self.assertEqual(result["stats"]["unchanged"], 1)
            apply.assert_not_called()
            self.assertIsNone(read_edit_spec(media))

    def test_an_unreadable_video_is_a_read_error(self, probe) -> None:
        probe.return_value = SourceProbe()
        with TempMediaFolder() as root:
            write_mp4_video(root)

            result = run_trim_video_job(root, max_seconds=3.0, ffmpeg="ffmpeg")

            self.assertEqual(result["stats"]["read_error"], 1)

    def test_a_file_open_in_a_render_is_reported_busy(self, _probe) -> None:
        with TempMediaFolder() as root:
            media = write_mp4_video(root)

            with claimed_elsewhere(media):
                result = run_trim_video_job(root, max_seconds=3.0, ffmpeg="ffmpeg")

            self.assertEqual(result["stats"]["busy"], 1)

    def test_a_failed_render_leaves_the_edit_as_it_was(self, _probe) -> None:
        with TempMediaFolder() as root:
            media = write_mp4_video(root)

            with patch(
                "automation.trim_video.apply_video_edit", side_effect=RuntimeError("ffmpeg failed")
            ):
                result = run_trim_video_job(root, max_seconds=3.0, ffmpeg="ffmpeg")

            self.assertEqual(result["stats"]["ffmpeg_error"], 1)
            self.assertIsNone(read_edit_spec(media))

    def test_a_cancelled_render_stops_the_run(self, _probe) -> None:
        with TempMediaFolder() as root:
            write_mp4_video(root, "first.mp4")
            write_mp4_video(root, "second.mp4")

            with patch("automation.trim_video.apply_video_edit", side_effect=FfmpegCancelled):
                result = run_trim_video_job(root, max_seconds=3.0, ffmpeg="ffmpeg")

            self.assertEqual(result["stats"]["cancelled"], 2)

    def test_reset_clears_the_trim_and_keeps_other_edits_without_probing(self, probe) -> None:
        with TempMediaFolder() as root:
            media = write_mp4_video(root)
            write_edit_backup(media)
            write_edit_spec(media, VideoEditSpec(trim_start=1.0, trim_end=4.0, scale=0.5))

            with patch("automation.trim_video.apply_video_edit") as apply:
                result = run_trim_video_job(root, max_seconds=3.0, reset_trim=True, ffmpeg="ffmpeg")

            self.assertEqual(result["stats"]["success"], 1)
            spec = apply.call_args.args[1]
            self.assertEqual((spec.trim_start, spec.trim_end, spec.scale), (0.0, None, 0.5))
            probe.assert_not_called()

    def test_clearing_the_only_edit_restores_the_original(self, _probe) -> None:
        with TempMediaFolder() as root:
            media = write_mp4_video(root)
            original = media.read_bytes()
            write_edit_backup(media)
            media.write_bytes(b"rendered")
            write_edit_spec(media, VideoEditSpec(trim_end=4.0))

            with patch("automation.trim_video.apply_video_edit") as apply:
                result = run_trim_video_job(root, max_seconds=3.0, reset_trim=True, ffmpeg="ffmpeg")

            self.assertEqual(result["stats"]["success"], 1)
            apply.assert_not_called()
            self.assertEqual(media.read_bytes(), original)
            self.assertFalse(edit_spec_path(media).exists())

    def test_reset_leaves_untrimmed_videos_untouched(self, _probe) -> None:
        with TempMediaFolder() as root:
            write_mp4_video(root)

            result = run_trim_video_job(root, max_seconds=3.0, reset_trim=True, ffmpeg="ffmpeg")

            self.assertEqual(result["stats"]["unchanged"], 1)


def _frame_count(executable: str, media: Path) -> int:
    result = subprocess.run(
        [executable, "-nostdin", "-i", str(media), "-map", "0:v:0", "-f", "null", "-"],
        capture_output=True,
        text=True,
        timeout=60,
    ).stderr
    return int(result.rsplit("frame=", 1)[1].split()[0])


class RenderTests(unittest.TestCase):
    def setUp(self) -> None:
        executable = ffmpeg_path()
        if executable is None:
            self.skipTest("ffmpeg is not available")
        self.ffmpeg = executable

    def test_renders_the_kept_frames_and_reverts_to_the_original(self) -> None:
        with TempMediaFolder() as root:
            media = root / "count.mp4"
            subprocess.run(
                [
                    self.ffmpeg,
                    *("-nostdin", "-v", "error", "-f", "lavfi"),
                    *("-i", "testsrc=size=160x90:rate=24:duration=3", "-pix_fmt", "yuv420p"),
                    str(media),
                ],
                check=True,
                timeout=60,
            )
            original = media.read_bytes()

            result = run_trim_video_job(root, max_seconds=1.0, keep="middle")

            self.assertEqual(result["stats"]["success"], 1)
            self.assertEqual(_frame_count(self.ffmpeg, media), 24)
            self.assertEqual(backup_path_for(media).read_bytes(), original)

            revert_video_edit(media)
            self.assertEqual(media.read_bytes(), original)


class ValidationTests(unittest.TestCase):
    def test_a_folder_without_videos_is_refused(self) -> None:
        with TempMediaFolder() as root:
            write_image(root, "still.png")

            with self.assertRaises(ValueError):
                validate_trim_video_folder(root)

    def test_a_missing_folder_is_refused(self) -> None:
        with TempMediaFolder() as root, self.assertRaises(ValueError):
            validate_trim_video_folder(root / "missing")


if __name__ == "__main__":
    unittest.main()
