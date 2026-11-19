"""Rate is an ``fps`` filter, so per-frame delays still set duration."""

from __future__ import annotations

from contextlib import suppress
from datetime import UTC, datetime
from pathlib import Path

from constants import GIF_MP4_EXTENSION, GIF_MP4_FRAME_RATE
from edit_sidecars import (
    discard_edit_state,
    stale_path_for,
    sweep_edit_temp_files,
    temp_path_for,
)
from ffmpeg_bin import ffmpeg_path
from ffmpeg_run import ShouldCancel, run_ffmpeg
from file_publish import publish_replacing
from media_claims import claim
from schemas import GifToMp4Response, GifToMp4StateResponse

FFMPEG_MISSING_MESSAGE = "ffmpeg is required to convert a GIF"

GIF_TO_MP4_TIMEOUT_SECONDS = 900


def mp4_target_for(media: Path) -> Path:
    return media.with_suffix(GIF_MP4_EXTENSION)


def read_gif_to_mp4_state(media: Path) -> GifToMp4StateResponse:
    target = mp4_target_for(media)

    return GifToMp4StateResponse(
        path=str(media),
        target=str(target),
        target_exists=target.is_file(),
    )


def build_gif_to_mp4_command(
    source: Path,
    destination: Path,
    *,
    executable: str,
    frame_rate: float = GIF_MP4_FRAME_RATE,
) -> list[str]:
    """``yuv420p`` cannot express an odd dimension."""
    return [
        executable,
        "-nostdin",
        "-hide_banner",
        "-nostats",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(source),
        "-vf",
        f"fps={frame_rate:.6f},scale=trunc(iw/2)*2:trunc(ih/2)*2",
        # `-an`, so a mislabelled file gains no audio track.
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-f",
        "mp4",
        str(destination),
    ]


def convert_gif_to_mp4(
    media: Path,
    *,
    ffmpeg: str | None = None,
    should_cancel: ShouldCancel | None = None,
) -> GifToMp4Response:
    """Failure leaves an existing MP4 byte-identical."""
    executable = ffmpeg or ffmpeg_path()
    if not executable:
        raise RuntimeError(FFMPEG_MISSING_MESSAGE)

    target = mp4_target_for(media)
    # Two GIFs can never share a destination.
    with claim([target], "render") as held:
        sweep_edit_temp_files(target.parent)

        temp_path = temp_path_for(target)
        command = build_gif_to_mp4_command(media, temp_path, executable=executable)

        try:
            run_ffmpeg(
                command,
                should_cancel=held.cancel_check(should_cancel),
                timeout=GIF_TO_MP4_TIMEOUT_SECONDS,
            )
            publish_replacing(temp_path, target, stale_path_for(target))
        finally:
            with suppress(OSError):
                temp_path.unlink(missing_ok=True)

        # Otherwise the next edit would render from a gone file's backup.
        discard_edit_state(target)

    stat = target.stat()
    return GifToMp4Response(
        path=str(target),
        size=stat.st_size,
        modified_at=datetime.fromtimestamp(stat.st_mtime, tz=UTC).isoformat(),
        frame_rate=GIF_MP4_FRAME_RATE,
    )
