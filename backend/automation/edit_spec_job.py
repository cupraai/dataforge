"""Jobs that store an edit in the sidecar and render it from the original."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from automation.job_runner import FileOutcome, ProgressCallback, run_media_job
from automation.selection import filter_media_list, list_folder_media, require_folder
from constants import IMAGE_EDIT_EXTENSIONS, VIDEO_EDIT_EXTENSIONS
from ffmpeg_run import FfmpegCancelled, ShouldCancel
from image_edit import apply_image_edit, revert_image_edit
from image_edit import is_identity_spec as is_identity_image_spec
from image_io import ImageReadError
from schemas import ImageEditSpec, VideoEditSpec
from video_edit import SourceProbe, apply_video_edit, is_identity_spec, revert_video_edit

EDIT_EXTENSIONS = IMAGE_EDIT_EXTENSIONS | VIDEO_EDIT_EXTENSIONS
_NO_EDIT_FILES = "No JPG, PNG, WebP, BMP, MP4, MOV or M4V files found in folder"


def edit_job_files(
    folder: Path,
    selected_paths: list[Path] | None,
    *,
    extensions: set[str] = EDIT_EXTENSIONS,
    missing: str = _NO_EDIT_FILES,
) -> list[Path]:
    """Oldest first; raises ``ValueError`` when there is nothing to run on."""
    require_folder(folder)
    media_files = filter_media_list(
        list_folder_media(folder, extensions, order="mtime"), selected_paths
    )
    if not media_files:
        raise ValueError(missing)
    return media_files


def save_image_spec(media: Path, spec: ImageEditSpec) -> None:
    """An identity spec restores the original, so the file no longer reads as edited."""
    if is_identity_image_spec(spec):
        revert_image_edit(media)
    else:
        apply_image_edit(media, spec)


def save_video_spec(
    media: Path,
    spec: VideoEditSpec,
    *,
    ffmpeg: str | None,
    should_cancel: ShouldCancel | None,
    probe: SourceProbe | None,
) -> None:
    """An identity spec restores the original, so the file no longer reads as edited."""
    if is_identity_spec(spec):
        revert_video_edit(media)
    else:
        apply_video_edit(media, spec, ffmpeg=ffmpeg, should_cancel=should_cancel, probe=probe)


def run_edit_spec_job(
    folder: Path,
    media_files: list[Path],
    edit: Callable[[Path], str | None],
    *,
    unchanged: type[Exception],
    skipped: type[Exception] | None = None,
    by_kind: bool = False,
    on_progress: ProgressCallback | None = None,
    should_cancel: ShouldCancel | None = None,
) -> dict[str, object]:
    """``by_kind`` counts successes per kind; ``edit`` then returns ``image`` or ``video``."""
    skip_errors: tuple[type[Exception], ...] = (skipped,) if skipped is not None else ()

    def process(media_path: Path) -> FileOutcome:
        try:
            kind = edit(media_path)
        except unchanged:
            return FileOutcome.counted("unchanged")
        except FfmpegCancelled:
            return FileOutcome.cancelled()
        except skip_errors as exc:
            return FileOutcome.counted("skipped", exc)
        except (ImageReadError, ValueError) as exc:
            return FileOutcome.counted("read_error", exc)
        except RuntimeError as exc:
            return FileOutcome.counted("ffmpeg_error", exc)
        except OSError as exc:
            return FileOutcome.counted("write_error", exc)
        success = {"success": 1, f"{kind}_success": 1} if kind else {"success": 1}
        return FileOutcome(status="success", stats=success)

    stats = {"total": len(media_files), "success": 0}
    if by_kind:
        stats |= {"image_success": 0, "video_success": 0}
    stats["unchanged"] = 0
    if skipped is not None:
        stats["skipped"] = 0
    stats |= {"busy": 0, "read_error": 0, "write_error": 0, "ffmpeg_error": 0, "cancelled": 0}

    return run_media_job(
        folder,
        media_files,
        stats=stats,
        process=process,
        on_progress=on_progress,
        should_cancel=should_cancel,
        claim_activity="render",
        # Sub-stats of success, which must not be counted twice.
        processed_stat_keys=(
            ("success", "unchanged", "skipped", "busy", "read_error", "write_error", "ffmpeg_error")
            if by_kind
            else None
        ),
    )
