"""Shorten videos to a played length via the edit sidecar; never past an existing trim."""

from __future__ import annotations

import math
from pathlib import Path

from automation.job_runner import FileOutcome, ProgressCallback, run_media_job
from automation.selection import filter_media_list, list_folder_media
from constants import VIDEO_EDIT_EXTENSIONS
from edit_sidecars import original_path_for
from ffmpeg_bin import ffmpeg_path
from ffmpeg_run import FfmpegCancelled, ShouldCancel
from schemas import TrimVideoKeep, VideoEditSpec
from video_edit import (
    IDENTITY_EPSILON,
    SourceProbe,
    apply_video_edit,
    is_identity_spec,
    probe_source,
    read_edit_spec,
    revert_video_edit,
)

#: Float noise must not drop a whole frame.
_FRAME_EPSILON = 1e-6


class AlreadyTrimmedError(Exception):
    """Already within the length, or no trim to clear."""


def list_trim_video_files(folder: Path) -> list[Path]:
    return list_folder_media(folder, VIDEO_EDIT_EXTENSIONS, order="mtime")


def validate_trim_video_folder(folder: Path, selected_paths: list[Path] | None = None) -> None:
    if not folder.is_dir():
        raise ValueError("Folder not found")

    if not filter_media_list(list_trim_video_files(folder), selected_paths):
        raise ValueError("No MP4, MOV or M4V files found in folder")


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

    # Restore the original so the file no longer reads as edited.
    if is_identity_spec(trimmed):
        revert_video_edit(media)
    else:
        apply_video_edit(media, trimmed, ffmpeg=ffmpeg, should_cancel=should_cancel, probe=probe)


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
    validate_trim_video_folder(folder, selected_paths)

    media_files = filter_media_list(list_trim_video_files(folder), selected_paths)
    resolved_ffmpeg = ffmpeg or ffmpeg_path()

    def process(media_path: Path) -> FileOutcome:
        try:
            trim_video(
                media_path,
                max_seconds,
                keep,
                reset=reset_trim,
                ffmpeg=resolved_ffmpeg,
                should_cancel=should_cancel,
            )
            return FileOutcome(status="success", stats={"success": 1})
        except AlreadyTrimmedError:
            return FileOutcome.counted("unchanged")
        except FfmpegCancelled:
            return FileOutcome.cancelled()
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
            "unchanged": 0,
            "busy": 0,
            "read_error": 0,
            "write_error": 0,
            "ffmpeg_error": 0,
            "cancelled": 0,
        },
        process=process,
        on_progress=on_progress,
        should_cancel=should_cancel,
        claim_activity="render",
    )
