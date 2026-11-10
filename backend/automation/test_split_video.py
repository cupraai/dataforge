from __future__ import annotations

from testing_fixtures import isolate_test_database

isolate_test_database()

import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch

from pydantic import ValidationError

from automation.split_video import (
    ClipPiece,
    VideoFrames,
    build_clip_command,
    clip_stem,
    earlier_clips,
    interval_cuts,
    parse_video_frames,
    plan_pieces,
    run_split_video_job,
    validate_split_video_folder,
)
from constants import CLIPS_DIR_NAME, VIDEO_FRAME_RATES
from ffmpeg_bin import ffmpeg_path
from schemas import SplitVideoJobSettings, VideoFrameRate
from testing_fixtures import TempMediaFolder, claimed_elsewhere, write_image


def _frames(seconds: float, rate: int = 24) -> VideoFrames:
    count = round(seconds * rate)
    return VideoFrames(starts=[index / rate for index in range(count)], end=count / rate)


def _rounded(pieces: list[ClipPiece]) -> list[tuple[float, float]]:
    return [(round(piece.start, 3), round(piece.end, 3)) for piece in pieces]


class PlanTests(unittest.TestCase):
    def test_cuts_split_the_video_and_long_pieces_divide_on_frames(self) -> None:
        pieces = plan_pieces(_frames(12.0), [2.0], longest=4.0)

        # 0-2 fits; 2-12 is 10 s, so it becomes three parts, each edge on a 1/24 s frame.
        self.assertEqual(
            _rounded(pieces), [(0.0, 2.0), (2.0, 5.333), (5.333, 8.667), (8.667, 12.0)]
        )
        for piece in pieces:
            self.assertAlmostEqual(piece.start * 24, round(piece.start * 24))

    def test_a_piece_exactly_the_longest_is_not_divided(self) -> None:
        pieces = plan_pieces(_frames(8.0), [4.0], longest=4.0)

        self.assertEqual(_rounded(pieces), [(0.0, 4.0), (4.0, 8.0)])

    def test_cuts_snap_to_frames_and_past_the_picture_are_ignored(self) -> None:
        # 3.01 snaps to the frame at 3.0; 9.0 is after the last frame, where audio may run on.
        pieces = plan_pieces(_frames(6.0), [0.0, 3.01, 3.0, 9.0])

        self.assertEqual(_rounded(pieces), [(0.0, 3.0), (3.0, 6.0)])

    def test_the_video_may_start_after_zero(self) -> None:
        frames = VideoFrames(starts=[0.08 + index / 25 for index in range(50)], end=2.08)

        self.assertEqual(_rounded(plan_pieces(frames, [])), [(0.08, 2.08)])

    def test_interval_cuts_leave_the_remainder_last(self) -> None:
        self.assertEqual(interval_cuts(_frames(12.0), 5.0), [5.0, 10.0])
        self.assertEqual(interval_cuts(_frames(10.0), 5.0), [5.0])
        self.assertEqual(interval_cuts(_frames(3.0), 5.0), [])


class FramesTests(unittest.TestCase):
    def test_reads_display_order_and_the_last_frame_end(self) -> None:
        # Decode order with a B-frame; a packet without a timestamp is skipped.
        log = (
            "#tb 0: 1/12800\n"
            "#media_type 0: video\n"
            "0,          0,       1024,      512,      671, 0xde2d4a97, F=0x0\n"
            "0,        512,          0,      512,      511, 0x44f2fa42, F=0x0\n"
            "0,       1024,        512,      512,      500, 0x00000000, F=0x0\n"
            "0,       1536, -9223372036854775808,  512,  10, 0x00000000, F=0x0\n"
        )

        frames = parse_video_frames(log)

        assert frames is not None
        self.assertEqual(frames.starts, [0.0, 0.04, 0.08])
        self.assertAlmostEqual(frames.end, 0.12)
        self.assertAlmostEqual(frames.frame_rate, 25.0)

    def test_missing_packet_durations_last_like_the_others(self) -> None:
        log = "#tb 0: 1/1000\n0, 0, 0, 0, 1, 0x0\n0, 40, 40, 0, 1, 0x0\n0, 80, 80, 0, 1, 0x0\n"

        frames = parse_video_frames(log)

        assert frames is not None
        self.assertAlmostEqual(frames.end, 0.12)

    def test_no_frames_is_none(self) -> None:
        self.assertIsNone(parse_video_frames("#tb 0: 1/1000\n"))
        self.assertIsNone(parse_video_frames(""))

    def test_snap_picks_the_nearest_frame_start(self) -> None:
        frames = _frames(1.0)

        self.assertAlmostEqual(frames.snap(0.51), 12 / 24)
        self.assertAlmostEqual(frames.snap(0.53), 13 / 24)
        self.assertAlmostEqual(frames.snap(5.0), 23 / 24)


class CommandTests(unittest.TestCase):
    def test_cuts_half_a_frame_early_and_converts_the_rate(self) -> None:
        command = build_clip_command(
            "ffmpeg",
            Path("in.mkv"),
            Path("out.mp4"),
            ClipPiece(2.0, 4.0),
            frame_seconds=0.04,
            frame_rate=16,
        )

        self.assertEqual(command[command.index("-ss") + 1], "1.980000")
        self.assertEqual(command[command.index("-t") + 1], "1.980000")
        self.assertLess(command.index("-t"), command.index("-i"))
        self.assertTrue(command[command.index("-vf") + 1].endswith(",fps=16"))

    def test_the_first_clip_needs_no_seek_and_keeps_the_rate(self) -> None:
        command = build_clip_command(
            "ffmpeg",
            Path("in.mp4"),
            Path("o.mp4"),
            ClipPiece(0.0, 2.0),
            frame_seconds=0.04,
            frame_rate=None,
        )

        self.assertNotIn("-ss", command)
        self.assertNotIn("fps=", command[command.index("-vf") + 1])


class SettingsTests(unittest.TestCase):
    def test_the_frame_rate_choices_match_the_shared_constant(self) -> None:
        self.assertEqual(VideoFrameRate.__value__.__args__, VIDEO_FRAME_RATES)

    def test_the_shortest_clip_cannot_exceed_the_longest(self) -> None:
        with self.assertRaises(ValidationError):
            SplitVideoJobSettings(longest_seconds=2, shortest_seconds=3)
        with self.assertRaises(ValidationError):
            SplitVideoJobSettings(mode="interval", interval_seconds=2, shortest_seconds=3)
        # Only the limit of the chosen mode applies.
        SplitVideoJobSettings(
            mode="interval", interval_seconds=10, longest_seconds=2, shortest_seconds=3
        )


class ValidationTests(unittest.TestCase):
    def test_needs_a_video(self) -> None:
        with TempMediaFolder() as root:
            write_image(root, "still.png")
            with self.assertRaisesRegex(ValueError, "No videos"):
                validate_split_video_folder(root)

    def test_refuses_to_run_inside_the_clips_folder(self) -> None:
        with TempMediaFolder() as root:
            clips = root / CLIPS_DIR_NAME
            clips.mkdir()
            (clips / "a.mp4").write_bytes(b"x")
            with self.assertRaisesRegex(ValueError, "inside the"):
                validate_split_video_folder(clips)

    def test_videos_sharing_a_stem_name_their_clips_apart(self) -> None:
        walk_mp4, walk_mkv, run = Path("walk.mp4"), Path("Walk.MKV"), Path("run.mp4")
        videos = [walk_mp4, walk_mkv, run]

        self.assertEqual(clip_stem(walk_mp4, videos), "walk_mp4")
        self.assertEqual(clip_stem(walk_mkv, videos), "Walk_mkv")
        self.assertEqual(clip_stem(run, videos), "run")

    def test_earlier_clips_match_only_this_stem(self) -> None:
        with TempMediaFolder() as root:
            for name in ("a_001.mp4", "A_002.mp4", "a_1.mp4", "a_001_001.mp4", "ab_001.mp4"):
                (root / name).write_bytes(b"x")

            found = sorted(path.name for path in earlier_clips(root, "a"))
            self.assertEqual(found, ["A_002.mp4", "a_001.mp4"])


def _two_scene_video(executable: str, path: Path) -> None:
    """Two seconds of a test card, then two of a fractal: one cut at 2 s, with audio."""
    subprocess.run(
        [
            executable,
            "-nostdin",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=96x64:rate=24:duration=2",
            "-f",
            "lavfi",
            "-i",
            "mandelbrot=size=96x64:rate=24",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=4",
            "-filter_complex",
            "[1:v]trim=duration=2,setpts=PTS-STARTPTS[b];[0:v][b]concat=n=2:v=1:a=0[v]",
            "-map",
            "[v]",
            "-map",
            "2:a",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-shortest",
            str(path),
        ],
        check=True,
        capture_output=True,
        timeout=60,
    )


def _frames_and_rate(executable: str, path: Path) -> tuple[int, str]:
    """Frames decoded, and the rate ffmpeg's banner reports."""
    result = subprocess.run(
        [executable, "-hide_banner", "-i", str(path), "-map", "0:v:0", "-f", "null", "-"],
        capture_output=True,
        text=True,
        timeout=60,
    ).stderr
    frames = int(result.rsplit("frame=", 1)[1].split()[0])
    rate = result.split(" fps,", 1)[0].rsplit(", ", 1)[1]
    return frames, rate


class SplitJobTests(unittest.TestCase):
    def setUp(self) -> None:
        executable = ffmpeg_path()
        if executable is None:
            self.skipTest("ffmpeg is not available")
        self.ffmpeg = executable
        # Earlier clips are replaced through the delete path; keep them out of the Recycle Bin.
        trash = patch("file_trash.sys.platform", "linux")
        trash.start()
        self.addCleanup(trash.stop)

    def _clips(self, root: Path) -> list[str]:
        return sorted(path.name for path in (root / CLIPS_DIR_NAME).iterdir())

    def test_cuts_at_the_scene_change_and_converts_the_rate(self) -> None:
        with TempMediaFolder() as root:
            source = root / "walk.mp4"
            _two_scene_video(self.ffmpeg, source)
            (root / "walk.txt").write_text("source caption", encoding="utf-8")

            result = run_split_video_job(
                root, mode="scenes", longest_seconds=5, shortest_seconds=1, frame_rate=16
            )

            self.assertEqual(result["stats"]["clips"], 2)
            self.assertEqual(self._clips(root), ["walk_001.mp4", "walk_002.mp4"])
            for clip in ("walk_001.mp4", "walk_002.mp4"):
                frames, rate = _frames_and_rate(self.ffmpeg, root / CLIPS_DIR_NAME / clip)
                self.assertEqual(rate, "16")
                self.assertEqual(frames, 32)
            # The source and its caption are left alone.
            self.assertTrue(source.is_file())
            self.assertEqual((root / "walk.txt").read_text(encoding="utf-8"), "source caption")

    def test_splitting_again_replaces_earlier_clips_and_their_captions(self) -> None:
        with TempMediaFolder() as root:
            _two_scene_video(self.ffmpeg, root / "walk.mp4")
            run_split_video_job(root, mode="interval", interval_seconds=1, shortest_seconds=0.5)
            self.assertEqual(len(self._clips(root)), 4)
            (root / CLIPS_DIR_NAME / "walk_004.txt").write_text("old", encoding="utf-8")

            run_split_video_job(root, mode="interval", interval_seconds=2, shortest_seconds=0.5)

            self.assertEqual(self._clips(root), ["walk_001.mp4", "walk_002.mp4"])

    def test_pieces_shorter_than_the_shortest_are_left_out(self) -> None:
        with TempMediaFolder() as root:
            _two_scene_video(self.ffmpeg, root / "walk.mp4")

            result = run_split_video_job(
                root, mode="interval", interval_seconds=3, shortest_seconds=1.5
            )

            self.assertEqual(result["stats"]["clips"], 1)
            self.assertEqual(self._clips(root), ["walk_001.mp4"])
            self.assertEqual([p for p in (root / CLIPS_DIR_NAME).iterdir() if "tmp" in p.name], [])

    def test_a_video_with_nothing_long_enough_is_skipped_and_keeps_its_clips(self) -> None:
        with TempMediaFolder() as root:
            _two_scene_video(self.ffmpeg, root / "walk.mp4")
            run_split_video_job(root, mode="interval", interval_seconds=2, shortest_seconds=0.5)

            result = run_split_video_job(
                root, mode="interval", interval_seconds=10, shortest_seconds=10
            )

            self.assertEqual(result["stats"]["skipped"], 1)
            self.assertEqual(self._clips(root), ["walk_001.mp4", "walk_002.mp4"])

    def test_audio_running_past_the_picture_makes_no_empty_clip(self) -> None:
        """The container lasts as long as its longest stream; clips follow the picture only."""
        with TempMediaFolder() as root:
            subprocess.run(
                [
                    *(self.ffmpeg, "-nostdin", "-v", "error"),
                    *("-f", "lavfi", "-i", "testsrc2=size=96x64:rate=24:duration=3"),
                    *("-f", "lavfi", "-i", "sine=duration=5"),
                    *("-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac"),
                    str(root / "talk.mp4"),
                ],
                check=True,
                capture_output=True,
                timeout=60,
            )

            result = run_split_video_job(
                root, mode="interval", interval_seconds=2, shortest_seconds=0
            )

            self.assertEqual(result["stats"]["clips"], 2)
            counts = [
                _frames_and_rate(self.ffmpeg, root / CLIPS_DIR_NAME / name)[0]
                for name in self._clips(root)
            ]
            self.assertEqual(counts, [48, 24])

    def test_a_busy_source_is_reported_and_not_split(self) -> None:
        with TempMediaFolder() as root:
            source = root / "walk.mp4"
            _two_scene_video(self.ffmpeg, source)

            with claimed_elsewhere(source):
                result = run_split_video_job(root, mode="interval", interval_seconds=2)

            self.assertEqual(result["stats"]["busy"], 1)
            self.assertEqual(self._clips(root), [])


if __name__ == "__main__":
    unittest.main()
