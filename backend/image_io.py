"""The pixels must outlive the handle, or Windows locks the source."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageOps
from pillow_heif import register_heif_opener

# Registered process-wide, so every `Image.open` reads HEIC.
register_heif_opener()

JPEG_SUFFIXES = {".jpg", ".jpeg"}
JPEG_QUALITY = 92
WEBP_QUALITY = 92


#: EXIF Orientation values that turn the frame a quarter, swapping its sides.
QUARTER_TURN_ORIENTATIONS = frozenset({5, 6, 7, 8})

_ORIENTATION_TAG = 0x0112


class ImageReadError(Exception):
    """Pillow cannot open or decode the source."""


def displayed_image(image: Image.Image) -> Image.Image:
    """EXIF Orientation applied, then dropped."""
    if image.mode.startswith("I;16"):
        # Pillow clips 16-bit grey to white instead of scaling it.
        image = image.point(lambda value: value / 256).convert("L")
    return ImageOps.exif_transpose(image) or image


def displayed_size(image: Image.Image) -> tuple[int, int]:
    """Read from the header without decoding."""
    width, height = image.size
    if image.format == "TIFF":
        # Pillow's TIFF reader already turns size and pixels.
        return width, height
    # PngImageFile.getexif decodes every pixel looking for eXIf after IDAT.
    exif = Image.Image.getexif(image) if image.format == "PNG" else image.getexif()
    if exif.get(_ORIENTATION_TAG) in QUARTER_TURN_ORIENTATIONS:
        return height, width
    return width, height


def load_image_for_edit(source: Path) -> tuple[Image.Image, str, Image.Exif]:
    """Inside ``with`` so Windows does not lock a multi-frame JPEG or APNG."""
    try:
        with Image.open(source) as opened:
            opened.load()
            # So an edit is expressed against the frame the viewer sees.
            oriented = displayed_image(opened)
            source_mode = oriented.mode
            # convert("RGBA") drops tRNS from info.
            if source_mode == "P" and "transparency" in oriented.info:
                source_mode = "PA"
            return oriented.convert("RGBA"), source_mode, oriented.getexif()
    except OSError as exc:
        raise ImageReadError(str(exc)) from exc


def save_image_preserving_format(
    image: Image.Image,
    destination: Path,
    *,
    suffix: str,
    source_mode: str,
    exif: Image.Exif,
) -> None:
    """Paletted sources come back truecolor unless they had transparency."""
    suffix = suffix.lower()

    # Pillow's JPEG and WebP savers read the profile and density from encoderinfo only.
    icc_profile = image.info.get("icc_profile")
    dpi = image.info.get("dpi")
    icc = {"icc_profile": icc_profile} if icc_profile else {}
    density = {"dpi": dpi} if dpi else {}

    if suffix in JPEG_SUFFIXES:
        # 4:2:0 halves the resolution of thin strokes a crop magnifies.
        image.convert("RGB").save(
            destination,
            format="JPEG",
            quality=JPEG_QUALITY,
            subsampling=0,
            optimize=True,
            **({"exif": exif.tobytes()} if exif else {}),
            **icc,
            **density,
        )
        return

    if suffix == ".bmp":
        # BMP has no reliable slot for a profile or density.
        image.convert("RGB").save(destination, format="BMP")
        return

    keeps_alpha = source_mode in {"RGBA", "LA", "PA"} or (
        source_mode == "P" and "transparency" in image.info
    )
    prepared = image if keeps_alpha else image.convert("RGB")

    if suffix == ".webp":
        prepared.save(destination, format="WEBP", quality=WEBP_QUALITY, method=6, **icc)
        return

    prepared.save(destination, format="PNG", optimize=True, **icc, **density)
