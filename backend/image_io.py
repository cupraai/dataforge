"""Read an image into detached pixels and write it back. The pixels must outlive the handle or Windows locks the source."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageOps
from pillow_heif import register_heif_opener

# Registered for the whole process: the media routes import this module at startup, so every
# `Image.open` reads HEIC, not only the ones here.
register_heif_opener()

JPEG_SUFFIXES = {".jpg", ".jpeg"}
JPEG_QUALITY = 92
WEBP_QUALITY = 92


#: EXIF Orientation values that turn the stored frame a quarter turn, swapping its sides.
QUARTER_TURN_ORIENTATIONS = frozenset({5, 6, 7, 8})

_ORIENTATION_TAG = 0x0112


class ImageReadError(Exception):
    """Raised when Pillow cannot open or decode the source."""


def displayed_image(image: Image.Image) -> Image.Image:
    """The frame as browsers and the editor show it: EXIF Orientation applied, then dropped."""
    if image.mode.startswith("I;16"):
        # Pillow's own conversions clip 16-bit grey to white instead of scaling it.
        image = image.point(lambda value: value / 256).convert("L")
    return ImageOps.exif_transpose(image) or image


def displayed_size(image: Image.Image) -> tuple[int, int]:
    """:func:`displayed_image`'s size, read from the header without decoding the pixels."""
    width, height = image.size
    if image.format == "TIFF":
        # Pillow's TIFF reader reports the turned size itself and turns the pixels on load.
        return width, height
    # PngImageFile.getexif decodes every pixel to find an eXIf chunk after IDAT, which the PNG
    # spec forbids; the base reader uses what Image.open already parsed from the header.
    exif = Image.Image.getexif(image) if image.format == "PNG" else image.getexif()
    if exif.get(_ORIENTATION_TAG) in QUARTER_TURN_ORIENTATIONS:
        return height, width
    return width, height


def load_image_for_edit(source: Path) -> tuple[Image.Image, str, Image.Exif]:
    """Detached RGBA plus original mode and EXIF. Work happens inside ``with`` so Windows does not lock a multi-frame JPEG or APNG."""
    try:
        with Image.open(source) as opened:
            opened.load()
            # Drops Orientation so an edit is expressed against the frame the viewer sees.
            oriented = displayed_image(opened)
            source_mode = oriented.mode
            # Paletted tRNS lives on the original; convert("RGBA") drops it from info.
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
    """Write as the format ``suffix`` names. Paletted sources come back truecolor unless they carried transparency."""
    suffix = suffix.lower()

    # convert()/alpha_composite() carry info forward, but Pillow's JPEG and WebP savers read the
    # colour profile and density from encoderinfo only, so both are lost unless passed explicitly.
    icc_profile = image.info.get("icc_profile")
    dpi = image.info.get("dpi")
    icc = {"icc_profile": icc_profile} if icc_profile else {}
    density = {"dpi": dpi} if dpi else {}

    if suffix in JPEG_SUFFIXES:
        # 4:4:4: default 4:2:0 halves the resolution of thin strokes a crop magnifies.
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
        # BMP has no slot for a colour profile or density a viewer can be relied on to read.
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
