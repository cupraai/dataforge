"""Shorten videos to a played length via the edit sidecar; never past an existing trim."""

from __future__ import annotations

import math
from pathlib import Path

from automation.edit_spec_job import edit_job_files, run_edit_spec_job, save_video_spec
from automation.job_runner import ProgressCallback
from constants import VIDEO_EDIT_EXTENSIONS
from edit_sidecars import original_path_for
from ffmpeg_bin import ffmpeg_path
from ffmpeg_run import ShouldCancel
from schemas import TrimVideoKeep, VideoEditSpec
from video_edit import IDENTITY_EPSILON, SourceProbe, probe_source, read_edit_spec

#: Float noise must not drop a whole frame.
_FRAME_EPSILON = 1e-6


class AlreadyTrimmedError(Exception):
    """Already within the length, or no trim to clear."""


def _trim_video_files(folder: Path, selected_paths: list[Path] | None) -> list[Path]:
    return edit_job_files(
        folder,
        selected_paths,
        extensions=VIDEO_EDIT_EXTENSIONS,
        missing="No MP4, MOV or M4V files found in folder",
    )


def validate_trim_video_folder(folder: Path, selected_paths: list[Path] | None = None) -> None:
    _trim_video_files(folder, selected_paths)


def trimmed_spec(
    spec: VideoEditSpec, probe: SourceProbe, max_seconds: float, keep: TrimVideoKeep
) -> VideoEditSpec:
    """Trim values are frame boundaries; the half-frame margin belongs to the command."""
    fps = probe.frame_rate
    if fps is None:
        raise ValueError("The video's frame rate could not be read")

    first = round(spec.trim_start * fps)
    if spec.trim_end is not None:
        end = round(spec.trim_end * fps)
    elif probe.seconds is not None:
        end = round(probe.seconds * fps)
    else:
        raise ValueError("The video's length could not be read")

    # The source span over the speed.
    frames = max(1, math.floor(max_seconds * spec.speed * fps + _FRAME_EPSILON))
    if end - first <= frames:
        raise AlreadyTrimmedError

    if keep == "start":
        start = first
    elif keep == "middle":
        start = first + (end - first - frames) // 2
    else:
        start = end - frames

    # A kept edge stays exactly as stored.
    trim_start = spec.trim_start if start == first else start / fps
    trim_end = spec.trim_end if spec.trim_end is not None and start + frames == end else None
    # A take below the minimum trim is the file's read error, not a bad sidecar.
    return VideoEditSpec.model_validate(
        {
            **spec.model_dump(),
            "trim_start": trim_start,
            "trim_end": trim_end if trim_end is not None else (start + frames) / fps,
        }
    )


def _cleared_trim(spec: VideoEditSpec) -> VideoEditSpec:
    if spec.trim_start < IDENTITY_EPSILON and spec.trim_end is None:
        raise AlreadyTrimmedError
    return spec.model_copy(update={"trim_start": 0.0, "trim_end": None})


def trim_video(
    media: Path,
    max_seconds: float,
    keep: TrimVideoKeep,
    *,
    reset: bool = False,
    ffmpeg: str | None = None,
    should_cancel: ShouldCancel | None = None,
) -> None:
    spec = read_edit_spec(media) or VideoEditSpec()
    probe = None
    if reset:
        trimmed = _cleared_trim(spec)
    else:
        probe = probe_source(original_path_for(media))
        trimmed = trimmed_spec(spec, probe, max_seconds, keep)
    save_video_spec(media, trimmed, ffmpeg=ffmpeg, should_cancel=should_cancel, probe=probe)


def run_trim_video_job(
    folder: Path,
    *,
    on_progress: ProgressCallback | None = None,
    should_cancel: ShouldCancel | None = None,
    ffmpeg: str | None = None,
    selected_paths: list[Path] | None = None,
    max_seconds: float,
    keep: TrimVideoKeep = "start",
    reset_trim: bool = False,
) -> dict[str, object]:
    media_files = _trim_video_files(folder, selected_paths)
    resolved_ffmpeg = ffmpeg or ffmpeg_path()
    return run_edit_spec_job(
        folder,
        media_files,
        lambda media: trim_video(
            media,
            max_seconds,
            keep,
            reset=reset_trim,
            ffmpeg=resolved_ffmpeg,
            should_cancel=should_cancel,
        ),
        unchanged=AlreadyTrimmedError,
        on_progress=on_progress,
        should_cancel=should_cancel,
    )
