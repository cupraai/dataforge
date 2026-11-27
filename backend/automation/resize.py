"""Fit to a megapixel budget or reset; the rule lives in the edit sidecar."""

from __future__ import annotations

from pathlib import Path

from automation.edit_spec_job import (
    edit_job_files,
    run_edit_spec_job,
    save_image_spec,
    save_video_spec,
)
from automation.job_runner import ProgressCallback
from constants import VIDEO_EDIT_EXTENSIONS
from edit_sidecars import original_path_for
from ffmpeg_bin import ffmpeg_path
from ffmpeg_run import ShouldCancel
from image_edit import fit_input_size, read_image_edit_spec
from image_io import load_image_for_edit
from schemas import ImageEditSpec, SizeFit, VideoEditSpec, VideoFrameRate
from size_fit import fitted_size
from video_edit import cropped_frame_size, probe_source, read_edit_spec


class AlreadyResizedError(Exception):
    """The rule is already stored, or would not change the size."""


class TooSmallToResizeError(Exception):
    """A side is shorter than one grid cell."""


def validate_resize_folder(folder: Path, selected_paths: list[Path] | None = None) -> None:
    edit_job_files(folder, selected_paths)


def _with_fit[SpecT: (ImageEditSpec, VideoEditSpec)](
    spec: SpecT, fit: SizeFit, frame: tuple[int, int] | None, *, even: bool
) -> SpecT:
    """``None`` when it could not be read."""
    if spec.fit == fit:
        raise AlreadyResizedError

    if frame is not None:
        target = fitted_size(frame, fit, even=even)
        if target is None:
            raise TooSmallToResizeError(
                f"{frame[0]} x {frame[1]} px is smaller than one {fit.multiple} px cell"
            )
        # A no-op rule would re-encode for nothing.
        if target == frame and spec.fit is None and spec.scale == 1.0:
            raise AlreadyResizedError

    return spec.model_copy(update={"fit": fit, "scale": 1.0})


def _reset_size[SpecT: (ImageEditSpec, VideoEditSpec)](spec: SpecT) -> SpecT:
    if spec.fit is None and spec.scale == 1.0:
        raise AlreadyResizedError
    return spec.model_copy(update={"fit": None, "scale": 1.0})


def resize_image(media: Path, fit: SizeFit, *, reset: bool = False) -> None:
    spec = read_image_edit_spec(media) or ImageEditSpec()
    if reset:
        resized = _reset_size(spec)
    else:
        # EXIF orientation decides which side is the width.
        image, _, _ = load_image_for_edit(original_path_for(media))
        resized = _with_fit(spec, fit, fit_input_size(image.size, spec), even=False)
    save_image_spec(media, resized)


def resize_video(
    media: Path,
    fit: SizeFit,
    *,
    reset: bool = False,
    frame_rate: VideoFrameRate | None = None,
    ffmpeg: str | None = None,
    should_cancel: ShouldCancel | None = None,
) -> None:
    """``None`` leaves the stored rate alone."""
    spec = read_edit_spec(media) or VideoEditSpec()
    probe = None
    if reset:
        resized = _reset_size(spec)
    else:
        retimed = frame_rate is not None and spec.frame_rate != frame_rate
        probe = probe_source(original_path_for(media))
        frame = cropped_frame_size(probe.size, spec) if probe.size else None
        try:
            resized = _with_fit(spec, fit, frame, even=True)
        except AlreadyResizedError:
            if not retimed:
                raise
            resized = spec
        if retimed:
            resized = resized.model_copy(update={"frame_rate": frame_rate})
    save_video_spec(media, resized, ffmpeg=ffmpeg, should_cancel=should_cancel, probe=probe)


def resize_file(
    media: Path,
    fit: SizeFit,
    *,
    reset: bool = False,
    frame_rate: VideoFrameRate | None = None,
    ffmpeg: str | None = None,
    should_cancel: ShouldCancel | None = None,
) -> str:
    """Returns ``image`` or ``video``; images ignore ``frame_rate``."""
    if media.suffix.lower() in VIDEO_EDIT_EXTENSIONS:
        resize_video(
            media,
            fit,
            reset=reset,
            frame_rate=frame_rate,
            ffmpeg=ffmpeg,
            should_cancel=should_cancel,
        )
        return "video"

    resize_image(media, fit, reset=reset)
    return "image"


def run_resize_job(
    folder: Path,
    *,
    on_progress: ProgressCallback | None = None,
    should_cancel: ShouldCancel | None = None,
    ffmpeg: str | None = None,
    selected_paths: list[Path] | None = None,
    megapixels: float,
    multiple: int,
    reset_size: bool = False,
    frame_rate: VideoFrameRate | None = None,
) -> dict[str, object]:
    fit = SizeFit(megapixels=megapixels, multiple=multiple)
    media_files = edit_job_files(folder, selected_paths)
    resolved_ffmpeg = ffmpeg or ffmpeg_path()
    return run_edit_spec_job(
        folder,
        media_files,
        lambda media: resize_file(
            media,
            fit,
            reset=reset_size,
            frame_rate=frame_rate,
            ffmpeg=resolved_ffmpeg,
            should_cancel=should_cancel,
        ),
        unchanged=AlreadyResizedError,
        skipped=TooSmallToResizeError,
        by_kind=True,
        on_progress=on_progress,
        should_cancel=should_cancel,
    )
