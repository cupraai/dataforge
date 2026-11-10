"""Cut videos into clips in a ``clips/`` subfolder, at scene changes or at a fixed interval.

Sources and their captions are left alone. Each source's clips are named ``<stem>_001.mp4`` on;
splitting it again replaces its earlier clips, captions included, so a clip never keeps a
caption written for different footage.

Every length is measured on the video stream's own frames, never the container: a file whose
audio runs past its picture would otherwise get clips with no picture in them.
"""

from __future__ import annotations

import bisect
import math
import re
import statistics
from contextlib import suppress
from dataclasses import dataclass
from itertools import pairwise
from pathlib import Path

from automation.job_runner import FileOutcome, ProgressCallback, run_media_job
from automation.selection import filter_media_list, list_folder_media
from constants import CLIPS_DIR_NAME, VIDEO_EXTENSIONS
from ffmpeg_bin import ffmpeg_path
from ffmpeg_run import FfmpegCancelled, ShouldCancel, run_ffmpeg, stream_ffmpeg
from file_publish import publish_replacing
from media_delete import delete_media_with_sidecars
from scene_detect import (
    ANALYSIS_FRAME_BYTES,
    ANALYSIS_HEIGHT,
    ANALYSIS_WIDTH,
    CutDetector,
    frame_features,
)
from schemas import SceneSensitivity, SplitVideoJobSettings
from video_edit import AAC_OUTPUT_ARGS, H264_OUTPUT_ARGS

CLIP_EXTENSION = ".mp4"
SPLIT_TEMP_MARKER = ".split-tmp"
SPLIT_STALE_MARKER = ".split-stale"

_TIMEBASE = re.compile(r"^#tb 0: (\d+)/(\d+)", re.MULTILINE)
#: ``framecrc`` packet lines: stream, dts, pts, duration, size, checksum.
_PACKET = re.compile(r"^0,\s*-?\d+,\s*(-?\d+),\s*(\d+),", re.MULTILINE)


class NothingToKeepError(Exception):
    """Every piece came out shorter than the shortest clip."""


@dataclass(frozen=True)
class ClipPiece:
    start: float
    end: float

    @property
    def seconds(self) -> float:
        return self.end - self.start


@dataclass(frozen=True)
class VideoFrames:
    """When each frame of the video stream starts, in display order, and when the last ends."""

    starts: list[float]
    end: float

    @property
    def frame_seconds(self) -> float:
        if len(self.starts) < 2:
            return self.end - (self.starts[0] if self.starts else 0.0)
        return statistics.median(b - a for a, b in pairwise(self.starts))

    @property
    def frame_rate(self) -> float:
        return 1 / self.frame_seconds if self.frame_seconds > 0 else 0.0

    def snap(self, seconds: float) -> float:
        """The frame start nearest ``seconds``, so a clip holds whole frames."""
        index = bisect.bisect_left(self.starts, seconds)
        nearby = self.starts[max(0, index - 1) : index + 1]
        return min(nearby, key=lambda start: abs(start - seconds)) if nearby else seconds


def parse_video_frames(log: str) -> VideoFrames | None:
    """Read ``framecrc`` output for the first video stream; ``None`` without a single frame."""
    timebase = _TIMEBASE.search(log)
    if timebase is None:
        return None
    unit = int(timebase.group(1)) / int(timebase.group(2))
    # Packets arrive in decode order; B-frames put display order elsewhere.
    packets = sorted(
        (int(pts), int(duration))
        for pts, duration in _PACKET.findall(log)
        # ffmpeg prints a packet without a timestamp as the lowest 64-bit integer.
        if int(pts) > -(2**62)
    )
    if not packets:
        return None
    end = max(pts + duration for pts, duration in packets) * unit
    starts = [pts * unit for pts, _ in packets]
    # Some containers store no packet durations; then the last frame lasts like the others.
    if end <= starts[-1] and len(starts) > 1:
        end = starts[-1] + statistics.median(b - a for a, b in pairwise(starts))
    return VideoFrames(starts=starts, end=end)


def plan_pieces(
    frames: VideoFrames, cuts: list[float], *, longest: float | None = None
) -> list[ClipPiece]:
    """Every piece between ``cuts``, with a piece longer than ``longest`` divided into equal
    parts. Every boundary sits on a frame start, so no piece is empty or holds part of a frame."""
    first = frames.starts[0]
    # Filtered before snapping: a cut after the picture would snap onto its last frame.
    inner = {frames.snap(cut) for cut in cuts if first < cut < frames.end}
    bounds = sorted({first, *(cut for cut in inner if first < cut < frames.end), frames.end})

    pieces: list[ClipPiece] = []
    for start, end in pairwise(bounds):
        parts = 1 if longest is None else max(1, math.ceil((end - start) / longest - 1e-9))
        step = (end - start) / parts
        edges = [start, *(frames.snap(start + step * index) for index in range(1, parts)), end]
        pieces += [ClipPiece(a, b) for a, b in pairwise(sorted(set(edges))) if b > a]
    return pieces


def interval_cuts(frames: VideoFrames, interval: float) -> list[float]:
    first = frames.starts[0]
    count = math.ceil((frames.end - first) / interval - 1e-9)
    return [first + interval * index for index in range(1, count)]


def _frames_command(executable: str, source: Path) -> list[str]:
    """Lists the video packets without decoding them, on stderr, which is what run_ffmpeg keeps."""
    return [
        executable,
        *("-nostdin", "-hide_banner", "-nostats", "-loglevel", "error"),
        *("-i", str(source), "-map", "0:v:0", "-c", "copy", "-f", "framecrc", "pipe:2"),
    ]


def _analysis_command(executable: str, source: Path) -> list[str]:
    """Every frame, tiny, in order; ``passthrough`` so none is dropped or repeated."""
    return [
        executable,
        *("-nostdin", "-hide_banner", "-nostats", "-loglevel", "error"),
        *("-i", str(source), "-map", "0:v:0", "-an", "-sn", "-fps_mode", "passthrough"),
        *("-vf", f"scale={ANALYSIS_WIDTH}:{ANALYSIS_HEIGHT}:flags=area"),
        *("-f", "rawvideo", "-pix_fmt", "bgr24", "pipe:1"),
    ]


def read_video_frames(
    executable: str, source: Path, should_cancel: ShouldCancel | None = None
) -> VideoFrames:
    log = run_ffmpeg(_frames_command(executable, source), should_cancel=should_cancel)
    frames = parse_video_frames(log)
    if frames is None:
        raise ValueError("The video has no frames that could be read")
    return frames


def detect_scene_cuts(
    executable: str,
    source: Path,
    frames: VideoFrames,
    sensitivity: SceneSensitivity,
    should_cancel: ShouldCancel | None = None,
) -> list[float]:
    """The start of every frame that opens a new scene."""
    detector = CutDetector(sensitivity, frames.frame_rate or 24.0)
    stream_ffmpeg(
        _analysis_command(executable, source),
        ANALYSIS_FRAME_BYTES,
        lambda chunk: detector.push(frame_features(chunk)),
        should_cancel=should_cancel,
    )
    # Decoded frames come out in display order, one per listed packet.
    return [frames.starts[index] for index in detector.finish() if index < len(frames.starts)]


def build_clip_command(
    executable: str,
    source: Path,
    destination: Path,
    piece: ClipPiece,
    *,
    frame_seconds: float,
    frame_rate: int | None,
) -> list[str]:
    """One clip, frame-exact: ``-ss`` half a frame before its first frame, and ``-t`` the clip
    less half a frame, as the video editor's trims do (see ``build_video_edit_command``)."""
    half_frame = frame_seconds / 2
    command = [executable, "-nostdin", "-hide_banner", "-nostats", "-loglevel", "error", "-y"]
    start = max(0.0, piece.start - half_frame)
    if start > 0:
        command += ["-ss", f"{start:.6f}"]
    command += ["-t", f"{piece.seconds - half_frame:.6f}"]
    command += ["-i", str(source), "-map", "0:v:0", "-map", "0:a:0?"]

    # yuv420p needs even sides; the fps filter goes last, so it sees the final frames.
    filters = ["scale=trunc(iw/2)*2:trunc(ih/2)*2", "setsar=1"]
    if frame_rate is not None:
        filters.append(f"fps={frame_rate}")
    command += ["-vf", ",".join(filters), *H264_OUTPUT_ARGS, *AAC_OUTPUT_ARGS]
    return [*command, "-movflags", "+faststart", "-f", "mp4", str(destination)]


def list_split_files(folder: Path) -> list[Path]:
    return list_folder_media(folder, VIDEO_EXTENSIONS)


def validate_split_video_folder(folder: Path, selected_paths: list[Path] | None = None) -> None:
    if not folder.is_dir():
        raise ValueError("Folder not found")

    if folder.name.lower() == CLIPS_DIR_NAME:
        raise ValueError(
            f'Cannot split videos inside the "{CLIPS_DIR_NAME}" folder. '
            "Open the parent folder and run the job there."
        )

    if not filter_media_list(list_split_files(folder), selected_paths):
        raise ValueError("No videos found in folder")

    output_dir = folder / CLIPS_DIR_NAME
    if output_dir.exists() and not output_dir.is_dir():
        raise ValueError(
            f'Cannot create the "{CLIPS_DIR_NAME}" folder: a file with that name already exists.'
        )


def clip_stem(source: Path, videos: list[Path]) -> str:
    """``walk`` for ``walk.mp4``, or ``walk_mkv`` when another video in the folder is ``walk.*``,
    so two sources never write, or replace, each other's clips."""
    shared = any(other != source and other.stem.lower() == source.stem.lower() for other in videos)
    return f"{source.stem}_{source.suffix.lstrip('.').lower()}" if shared else source.stem


def earlier_clips(output_dir: Path, stem: str) -> list[Path]:
    pattern = re.compile(rf"{re.escape(stem)}_\d{{3,}}{re.escape(CLIP_EXTENSION)}", re.IGNORECASE)
    try:
        entries = list(output_dir.iterdir())
    except OSError:
        return []
    return sorted(entry for entry in entries if pattern.fullmatch(entry.name) and entry.is_file())


def _sweep_temp_files(output_dir: Path) -> None:
    with suppress(OSError):
        for marker in (SPLIT_TEMP_MARKER, SPLIT_STALE_MARKER):
            for leftover in output_dir.glob(f"*{marker}*"):
                leftover.unlink(missing_ok=True)


def split_file(
    source: Path,
    output_dir: Path,
    settings: SplitVideoJobSettings,
    *,
    ffmpeg: str,
    stem: str | None = None,
    should_cancel: ShouldCancel | None = None,
) -> int:
    """Write ``source``'s clips into ``output_dir`` as ``<stem>_001.mp4`` on, and return how
    many were kept. ``stem`` defaults to the source's."""
    stem = stem or source.stem
    frames = read_video_frames(ffmpeg, source, should_cancel)

    if settings.mode == "scenes":
        cuts = detect_scene_cuts(ffmpeg, source, frames, settings.sensitivity, should_cancel)
        pieces = plan_pieces(frames, cuts, longest=settings.longest_seconds)
    else:
        pieces = plan_pieces(frames, interval_cuts(frames, settings.interval_seconds))

    # Half a frame of slack: lengths are whole frames, so 2 s at 23.976 fps is 1.9987 s.
    slack = frames.frame_seconds / 2
    kept = [piece for piece in pieces if piece.seconds + slack >= settings.shortest_seconds]
    if not kept:
        raise NothingToKeepError(
            f"Every piece is shorter than {settings.shortest_seconds:g} s; nothing was written"
        )

    temps = [
        output_dir / f"{stem}{SPLIT_TEMP_MARKER}-{index:04d}{CLIP_EXTENSION}"
        for index in range(len(kept))
    ]
    try:
        for piece, temp in zip(kept, temps, strict=True):
            run_ffmpeg(
                build_clip_command(
                    ffmpeg,
                    source,
                    temp,
                    piece,
                    frame_seconds=frames.frame_seconds,
                    frame_rate=settings.frame_rate,
                ),
                should_cancel=should_cancel,
            )

        # Only once every new clip exists: a failed split leaves the earlier clips in place.
        for clip in earlier_clips(output_dir, stem):
            delete_media_with_sidecars(clip)

        for number, temp in enumerate(temps, start=1):
            final = output_dir / f"{stem}_{number:03d}{CLIP_EXTENSION}"
            stale = final.with_name(f"{final.stem}{SPLIT_STALE_MARKER}{CLIP_EXTENSION}")
            publish_replacing(temp, final, stale)
    finally:
        for temp in temps:
            with suppress(OSError):
                temp.unlink(missing_ok=True)

    return len(kept)


def run_split_video_job(
    folder: Path,
    *,
    on_progress: ProgressCallback | None = None,
    should_cancel: ShouldCancel | None = None,
    ffmpeg: str | None = None,
    selected_paths: list[Path] | None = None,
    **settings: object,
) -> dict[str, object]:
    validate_split_video_folder(folder, selected_paths)
    parsed = SplitVideoJobSettings.model_validate(settings)

    resolved_ffmpeg = ffmpeg or ffmpeg_path()
    if not resolved_ffmpeg:
        raise RuntimeError("FFmpeg was not found, so videos cannot be split")

    videos = list_split_files(folder)
    media_files = filter_media_list(videos, selected_paths)
    output_dir = folder / CLIPS_DIR_NAME
    output_dir.mkdir(exist_ok=True)
    _sweep_temp_files(output_dir)

    def process(media_path: Path) -> FileOutcome:
        try:
            clips = split_file(
                media_path,
                output_dir,
                parsed,
                ffmpeg=resolved_ffmpeg,
                stem=clip_stem(media_path, videos),
                should_cancel=should_cancel,
            )
            return FileOutcome(status="success", stats={"success": 1, "clips": clips})
        except FfmpegCancelled:
            return FileOutcome.cancelled()
        except NothingToKeepError as exc:
            return FileOutcome.counted("skipped", exc)
        except ValueError as exc:
            return FileOutcome.counted("read_error", exc)
        except RuntimeError as exc:
            return FileOutcome.counted("ffmpeg_error", exc)
        except OSError as exc:
            return FileOutcome.counted("write_error", exc)

    return run_media_job(
        folder,
        media_files,
        stats={
            "total": len(media_files),
            "success": 0,
            "clips": 0,
            "skipped": 0,
            "busy": 0,
            "read_error": 0,
            "write_error": 0,
            "ffmpeg_error": 0,
            "cancelled": 0,
        },
        process=process,
        on_progress=on_progress,
        should_cancel=should_cancel,
        # Read, not written: another writer replacing the source mid-encode would cut a mix.
        claim_activity="export",
        # clips counts outputs, not files.
        processed_stat_keys=(
            "success",
            "skipped",
            "busy",
            "read_error",
            "write_error",
            "ffmpeg_error",
        ),
    )
