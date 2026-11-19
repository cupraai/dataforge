"""Carry a source's provenance metadata onto the ComfyUI candidate that replaces it."""

from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image

from automation.strip_metadata import (
    EXIF_HEADER,
    PNG_PROVENANCE_CHUNKS,
    PNG_SIGNATURE,
    iter_png_chunks,
    png_chunk,
    strip_png_chunks,
    upright_exif,
)
from constants import IMAGE_EXTENSIONS, VIDEO_EXTENSIONS
from ffmpeg_bin import ffmpeg_path
from ffmpeg_run import run_ffmpeg

_PNG_IHDR = b"IHDR"
_XMP_KEYWORD = b"XML:com.adobe.xmp"
_COMMENT_KEYWORD = b"Comment"
# The temp suffix names no container.
_ISOBMFF_MUXERS = {".mp4": "mp4", ".mov": "mov"}


def _itxt_chunk(keyword: bytes, text: bytes) -> bytes:
    # Uncompressed, with empty language tag and translated keyword.
    return png_chunk(b"iTXt", keyword + b"\x00\x00\x00\x00\x00" + text)


def _source_png_chunks(source: Path) -> list[bytes]:
    """The source's metadata as PNG chunks; Orientation resets since ComfyUI loaded it upright."""
    if source.suffix.lower() == ".png":
        return [
            png_chunk(b"eXIf", upright_exif(chunk[8:-4])) if chunk_type == b"eXIf" else chunk
            for chunk_type, chunk in iter_png_chunks(source.read_bytes())
            if chunk_type in PNG_PROVENANCE_CHUNKS
        ]

    with Image.open(source) as image:
        info = dict(image.info)

    chunks: list[bytes] = []
    exif = info.get("exif")
    if isinstance(exif, bytes) and exif:
        chunks.append(png_chunk(b"eXIf", upright_exif(exif.removeprefix(EXIF_HEADER))))
    xmp = info.get("xmp")
    if isinstance(xmp, bytes) and xmp:
        chunks.append(_itxt_chunk(_XMP_KEYWORD, xmp))
    comment = info.get("comment")
    if isinstance(comment, bytes) and comment:
        chunks.append(_itxt_chunk(_COMMENT_KEYWORD, comment))
    return chunks


def _png_with_metadata(candidate: Path, transplanted: list[bytes]) -> bytes:
    """``transplanted`` goes right after IHDR."""
    stripped = strip_png_chunks(candidate.read_bytes())

    parts = [PNG_SIGNATURE]
    for chunk_type, chunk in iter_png_chunks(stripped):
        parts.append(chunk)
        if chunk_type == _PNG_IHDR:
            parts.extend(transplanted)
    return b"".join(parts)


def _remux_with_source_metadata(
    source: Path, candidate: Path, destination: Path, *, ffmpeg: str | None
) -> None:
    """Every candidate stream untouched; only global tags come from the source."""
    executable = ffmpeg or ffmpeg_path()
    if not executable:
        raise RuntimeError("ffmpeg is required to keep a video's metadata")

    command = [
        executable,
        "-nostdin",
        "-hide_banner",
        "-nostats",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(candidate),
        "-i",
        str(source),
        "-map",
        "0",
        "-map_metadata",
        "1",
        "-map_chapters",
        "-1",
        "-c",
        "copy",
        # Otherwise the muxer drops the `prompt` and `workflow` tags.
        "-movflags",
        "+faststart+use_metadata_tags",
        "-f",
        _ISOBMFF_MUXERS[candidate.suffix.lower()],
        str(destination),
    ]
    run_ffmpeg(command)


def write_with_source_metadata(
    source: Path, candidate: Path, destination: Path, *, ffmpeg: str | None = None
) -> None:
    """Replace ``candidate``'s provenance metadata with ``source``'s; ``ValueError`` on failure."""
    candidate_suffix = candidate.suffix.lower()
    source_suffix = source.suffix.lower()

    still = candidate_suffix == ".png" and source_suffix in IMAGE_EXTENSIONS
    clip = candidate_suffix in _ISOBMFF_MUXERS and source_suffix in VIDEO_EXTENSIONS
    if not (still or clip):
        shutil.copy2(candidate, destination)
        return

    try:
        if still:
            transplanted = _source_png_chunks(source)
            if not transplanted:
                shutil.copy2(candidate, destination)
                return
            destination.write_bytes(_png_with_metadata(candidate, transplanted))
        else:
            _remux_with_source_metadata(source, candidate, destination, ffmpeg=ffmpeg)
    # UnidentifiedImageError is an OSError.
    except (OSError, RuntimeError) as error:
        raise ValueError(
            f"Could not keep the original metadata of {source.name}: {error}. "
            "Untick Keep original metadata to accept without it."
        ) from error
