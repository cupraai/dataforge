from __future__ import annotations

from pathlib import Path

from automation.edit_spec_job import (
    edit_job_files,
    run_edit_spec_job,
    save_image_spec,
    save_video_spec,
)
from automation.job_runner import ProgressCallback
from color_adjust import IDENTITY_EPSILON
from color_auto import (
    NothingToAnalyseError,
    image_analysis_pixels,
    suggest_adjust,
    video_analysis_pixels,
    with_auto,
)
from constants import VIDEO_EDIT_EXTENSIONS
from edit_sidecars import original_path_for
from ffmpeg_bin import ffmpeg_path
from ffmpeg_run import ShouldCancel
from image_edit import read_image_edit_spec
from schemas import ColorAdjust, ImageEditSpec, VideoEditSpec
from video_edit import probe_source, read_edit_spec


class AlreadyAdjustedError(Exception):
    """Applying or resetting would leave the file as it is."""


def validate_auto_adjust_folder(folder: Path, selected_paths: list[Path] | None = None) -> None:
    edit_job_files(folder, selected_paths)


def _same_adjust(first: ColorAdjust, second: ColorAdjust) -> bool:
    return all(
        abs(value - getattr(second, tool)) < IDENTITY_EPSILON
        for tool, value in first.model_dump().items()
    )


def _auto_adjusted[SpecT: (ImageEditSpec, VideoEditSpec)](
    spec: SpecT, suggestion: ColorAdjust, *, replace: bool
) -> SpecT:
    if replace:
        adjust, auto = with_auto(ColorAdjust(), None, suggestion)
    else:
        adjust, auto = with_auto(spec.adjust, spec.auto_adjust, suggestion)
    if _same_adjust(adjust, spec.adjust):
        raise AlreadyAdjustedError
    return spec.model_copy(update={"adjust": adjust, "auto_adjust": auto})


def _reset_adjustments[SpecT: (ImageEditSpec, VideoEditSpec)](spec: SpecT) -> SpecT:
    adjust = ColorAdjust()
    if spec.adjust == adjust and spec.auto_adjust is None:
        raise AlreadyAdjustedError
    return spec.model_copy(update={"adjust": adjust, "auto_adjust": None})


def auto_adjust_image(media: Path, *, replace: bool = False, reset: bool = False) -> None:
    spec = read_image_edit_spec(media) or ImageEditSpec()
    if reset:
        adjusted = _reset_adjustments(spec)
    else:
        pixels, weights = image_analysis_pixels(original_path_for(media), spec.masks, spec.crop)
        adjusted = _auto_adjusted(spec, suggest_adjust(pixels, weights), replace=replace)
    save_image_spec(media, adjusted)


def auto_adjust_video(
    media: Path,
    *,
    replace: bool = False,
    reset: bool = False,
    ffmpeg: str | None = None,
    should_cancel: ShouldCancel | None = None,
) -> None:
    spec = read_edit_spec(media) or VideoEditSpec()
    probe = None
    if reset:
        adjusted = _reset_adjustments(spec)
    else:
        source = original_path_for(media)
        probe = probe_source(source)
        pixels, weights = video_analysis_pixels(
            source,
            spec.masks,
            spec.crop,
            start=spec.trim_start,
            end=spec.trim_end,
            duration=probe.seconds,
        )
        adjusted = _auto_adjusted(spec, suggest_adjust(pixels, weights), replace=replace)
    save_video_spec(media, adjusted, ffmpeg=ffmpeg, should_cancel=should_cancel, probe=probe)


def auto_adjust_file(
    media: Path,
    *,
    replace: bool = False,
    reset: bool = False,
    ffmpeg: str | None = None,
    should_cancel: ShouldCancel | None = None,
) -> str:
    """Returns ``image`` or ``video``."""
    if media.suffix.lower() in VIDEO_EDIT_EXTENSIONS:
        auto_adjust_video(
            media, replace=replace, reset=reset, ffmpeg=ffmpeg, should_cancel=should_cancel
        )
        return "video"

    auto_adjust_image(media, replace=replace, reset=reset)
    return "image"


def run_auto_adjust_job(
    folder: Path,
    *,
    on_progress: ProgressCallback | None = None,
    should_cancel: ShouldCancel | None = None,
    ffmpeg: str | None = None,
    selected_paths: list[Path] | None = None,
    replace_adjustments: bool = False,
    reset_adjustments: bool = False,
) -> dict[str, object]:
    media_files = edit_job_files(folder, selected_paths)
    resolved_ffmpeg = ffmpeg or ffmpeg_path()
    return run_edit_spec_job(
        folder,
        media_files,
        lambda media: auto_adjust_file(
            media,
            replace=replace_adjustments,
            reset=reset_adjustments,
            ffmpeg=resolved_ffmpeg,
            should_cancel=should_cancel,
        ),
        unchanged=AlreadyAdjustedError,
        skipped=NothingToAnalyseError,
        by_kind=True,
        on_progress=on_progress,
        should_cancel=should_cancel,
    )
