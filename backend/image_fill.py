"""Generative fill pixels: the mask a browser paints, the crop a model sees, and the patch it returns.

Everything is expressed in the EXIF-oriented original's pixels, the frame the editor shows. A fill
is generated from the original plus every earlier fill, before any other edit, so blur, geometry
and color changes are never baked into generated pixels.

A model only ever sees a context crop around the selection, scaled to an inference budget. Its
output is scaled back and composited through a feathered blend mask that lies wholly inside the
binary generation mask, so the crop's unselected pixels never replace the source.

Generated pixels are stored losslessly: a temporary result per generation, server-managed, and the
``<name>.fills`` archive beside an edited file once Apply references them. The pixels are the
authoritative record; a fill is never regenerated to reopen or re-render an edit.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import io
import json
import logging
import math
import os
import shutil
import time
import zipfile
from collections.abc import Iterable
from contextlib import suppress
from dataclasses import dataclass
from functools import partial
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter, UnidentifiedImageError

from api_errors import ConflictError
from edit_sidecars import fill_assets_path
from file_write import retry_while_locked, write_bytes_atomic
from schemas import FillBox, ImageFill

logger = logging.getLogger(__name__)

#: The context crop is scaled to about this many pixels for inference, and never more than this
#: far up: a small selection gains no detail from being blown up further.
FILL_TARGET_PIXELS = 1024 * 1024
FILL_MAX_UPSCALE = 2.0
#: Qwen-Image 2.1 latents need both sides on this grid.
FILL_SIZE_MULTIPLE = 32

#: Context added on each side of the selection, as a fraction of its longer side.
FILL_CONTEXT_FRACTION = 0.5
FILL_MIN_CONTEXT_PX = 64
#: A crop smaller than this on its short side gives the model too little scene to continue.
FILL_MIN_CROP_SIDE_PX = 384

#: The blend fades over this fraction of the crop's longer side, never less than the minimum.
FILL_FEATHER_FRACTION = 0.01
FILL_MIN_FEATHER_PX = 2
#: A one-pixel run must survive each box pass of :func:`_dilated`: 255 / (2r + 1) has to round up.
FILL_MAX_FEATHER_PX = 200

#: Fewer painted pixels than this is a stray click rather than a selection.
FILL_MIN_SELECTED_PIXELS = 4

#: Unkept results outlive an editor session by this much, then a later generation sweeps them.
FILL_RESULT_RETENTION_SECONDS = 24 * 60 * 60

_RESULT_META = "fill.json"
_RESULT_GENERATED = "generated.png"
_RESULT_BLEND = "blend.png"
_RESULT_OWNER = "owner.json"

FILL_RESULTS_ENV = "DATAFORGE_FILL_RESULTS"


class FillMaskError(ValueError):
    """The painted mask cannot be used: undecodable, the wrong size or empty."""


class FillOutputError(ValueError):
    """ComfyUI answered with something that is not the patch the request asked for."""


class FillUnavailableError(ConflictError):
    """A fill the draft or spec names cannot be used, with what the user can do about it."""

    code = "fill_unavailable"


@dataclass(frozen=True)
class FillGeometry:
    """Where the model's crop sits in the original, and the size it is generated at."""

    box: FillBox
    inference_width: int
    inference_height: int
    #: Blend width in original pixels.
    feather: int

    @property
    def bounds(self) -> tuple[int, int, int, int]:
        return (
            self.box.left,
            self.box.top,
            self.box.left + self.box.width,
            self.box.top + self.box.height,
        )


@dataclass(frozen=True)
class FillInputs:
    """What one generation uploads, and what compositing its answer needs."""

    geometry: FillGeometry
    #: The crop at inference size; RGBA only when the crop has transparency to edit.
    model_image: Image.Image
    #: Binary, at inference size: white regenerates.
    model_mask: Image.Image
    #: At crop size, inside the generation mask, 255 over the selection.
    blend: Image.Image
    opaque: bool


@dataclass(frozen=True)
class FillAsset:
    """A fill's provenance and its pixels, at crop size."""

    fill: ImageFill
    generated: Image.Image
    blend: Image.Image


def decode_mask(mask_png: str, size: tuple[int, int]) -> Image.Image:
    """The browser's mask as binary ``L``, checked against the frame before it is decoded."""
    try:
        data = base64.b64decode(mask_png, validate=True)
    except (binascii.Error, ValueError) as error:
        raise FillMaskError("The selection mask is not valid base64") from error

    try:
        with Image.open(io.BytesIO(data)) as opened:
            if opened.format != "PNG":
                raise FillMaskError("The selection mask must be a PNG")
            # The header is enough to refuse a mismatch, before a decode allocates anything.
            if opened.size != size:
                raise FillMaskError(
                    f"The selection mask is {opened.width} x {opened.height}, but the image is "
                    f"{size[0]} x {size[1]}. Reopen the editor and paint again."
                )
            opened.load()
            gray = opened.convert("L")
    except (OSError, UnidentifiedImageError, Image.DecompressionBombError) as error:
        raise FillMaskError(f"The selection mask cannot be read: {error}") from error

    mask = gray.point(lambda value: 255 if value >= 128 else 0)
    if selected_pixels(mask) < FILL_MIN_SELECTED_PIXELS:
        raise FillMaskError("Paint over what to fill first")
    return mask


def selected_pixels(mask: Image.Image) -> int:
    return mask.histogram()[255]


def _grow_span(start: int, end: int, minimum: int, limit: int) -> tuple[int, int]:
    """Widen ``[start, end)`` to ``minimum`` around its centre, shifted back inside ``[0, limit)``."""
    span = end - start
    if span >= minimum or limit <= span:
        return start, end
    target = min(minimum, limit)
    start = max(0, start - (target - span) // 2)
    end = start + target
    if end > limit:
        start, end = limit - target, limit
    return start, end


def _grid_size(length: float) -> int:
    return max(FILL_SIZE_MULTIPLE, round(length / FILL_SIZE_MULTIPLE) * FILL_SIZE_MULTIPLE)


def plan_fill_geometry(size: tuple[int, int], selection: tuple[int, int, int, int]) -> FillGeometry:
    """The context crop around ``selection`` (a bounding box, right and bottom exclusive)."""
    width, height = size
    left, top, right, bottom = selection
    pad = max(FILL_MIN_CONTEXT_PX, round(FILL_CONTEXT_FRACTION * max(right - left, bottom - top)))

    left, right = _grow_span(
        max(0, left - pad), min(width, right + pad), FILL_MIN_CROP_SIDE_PX, width
    )
    top, bottom = _grow_span(
        max(0, top - pad), min(height, bottom + pad), FILL_MIN_CROP_SIDE_PX, height
    )

    crop_width, crop_height = right - left, bottom - top
    scale = min(FILL_MAX_UPSCALE, math.sqrt(FILL_TARGET_PIXELS / (crop_width * crop_height)))
    feather = round(FILL_FEATHER_FRACTION * max(crop_width, crop_height))

    return FillGeometry(
        box=FillBox(left=left, top=top, width=crop_width, height=crop_height),
        inference_width=_grid_size(crop_width * scale),
        inference_height=_grid_size(crop_height * scale),
        feather=min(FILL_MAX_FEATHER_PX, max(FILL_MIN_FEATHER_PX, feather)),
    )


def _dilated(mask: Image.Image, radius: int) -> Image.Image:
    """Square dilation by ``radius``, exact: each box pass is thresholded before the next."""
    if radius <= 0:
        return mask
    spread = mask.filter(ImageFilter.BoxBlur((radius, 0))).point(lambda v: 255 if v else 0)
    return spread.filter(ImageFilter.BoxBlur((0, radius))).point(lambda v: 255 if v else 0)


def generation_and_blend(mask: Image.Image, feather: int) -> tuple[Image.Image, Image.Image]:
    """The binary area the model regenerates, and the soft mask its answer is blended through.

    The generation mask is the selection grown by the whole feather, so the fade runs over
    regenerated pixels rather than over the object's own edge. The blend is 255 over the
    selection and 0 everywhere outside the generation mask.
    """
    generation = _dilated(mask, feather)
    # Two sigmas each way of the halved edge: about 98% at the selection, 2% at the clip.
    halo = _dilated(mask, feather // 2).filter(ImageFilter.GaussianBlur(feather / 4))
    blend = ImageChops.darker(ImageChops.lighter(halo, mask), generation)
    return generation, blend


def is_opaque(image: Image.Image) -> bool:
    return "A" not in image.getbands() or image.getchannel("A").getextrema() == (255, 255)


def prepare_fill_inputs(base: Image.Image, mask: Image.Image) -> FillInputs:
    """Cut the model's crop and masks from the RGBA base the fill goes on."""
    bounds = mask.getbbox()
    if bounds is None:
        raise FillMaskError("Paint over what to fill first")

    geometry = plan_fill_geometry(base.size, bounds)
    crop = base.crop(geometry.bounds)
    generation, blend = generation_and_blend(mask.crop(geometry.bounds), geometry.feather)

    inference = (geometry.inference_width, geometry.inference_height)
    opaque = is_opaque(crop)
    model_image = (crop.convert("RGB") if opaque else crop).resize(
        inference, Image.Resampling.LANCZOS
    )
    # Any coverage counts after scaling, so a thin stroke cannot vanish between pixels.
    model_mask = generation.resize(inference, Image.Resampling.BILINEAR).point(
        lambda v: 255 if v else 0
    )

    return FillInputs(
        geometry=geometry,
        model_image=model_image,
        model_mask=model_mask,
        blend=blend,
        opaque=opaque,
    )


def generated_patch(output: Image.Image, inputs: FillInputs) -> Image.Image:
    """The model's answer at crop size. An opaque source stays opaque: its alpha is not edited."""
    expected = (inputs.geometry.inference_width, inputs.geometry.inference_height)
    if output.size != expected:
        raise FillOutputError(
            f"ComfyUI returned a {output.width} x {output.height} image for a "
            f"{expected[0]} x {expected[1]} request"
        )

    box = inputs.geometry.box
    patch = output.convert("RGBA").resize((box.width, box.height), Image.Resampling.LANCZOS)
    if inputs.opaque:
        patch.putalpha(255)
    return patch


def composite_fill(base: Image.Image, asset: FillAsset) -> Image.Image:
    """``base`` with one fill blended in. Pixels where the blend is 0 come through untouched."""
    box = asset.fill.box
    bounds = (box.left, box.top, box.left + box.width, box.top + box.height)
    if bounds[2] > base.width or bounds[3] > base.height:
        raise FillUnavailableError(
            "A fill reaches past the edge of this image; the original changed size since it was "
            "made. Remove the fills and generate them again."
        )

    region = base.crop(bounds)
    patched = Image.composite(asset.generated, region, asset.blend)
    out = base.copy()
    out.paste(patched, bounds[:2])
    return out


def apply_fill_chain(image: Image.Image, assets: Iterable[FillAsset]) -> Image.Image:
    for asset in assets:
        image = composite_fill(image, asset)
    return image


def file_digest(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(partial(handle.read, 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _same_media(a: str, b: Path) -> bool:
    return os.path.normcase(os.path.abspath(a)) == os.path.normcase(os.path.abspath(b))


def results_root() -> Path:
    override = os.environ.get(FILL_RESULTS_ENV)
    if override:
        return Path(override)
    return Path(__file__).resolve().parent / "data" / "fill_results"


def _result_dir(fill_id: str) -> Path:
    # The id is schema-checked hex before it gets here; this is the only path built from it.
    return results_root() / fill_id


def _png_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", compress_level=6)
    return buffer.getvalue()


def save_result(media: Path, asset: FillAsset) -> None:
    """Write a finished generation where only this server reads it; the browser gets its id."""
    root = results_root()
    root.mkdir(parents=True, exist_ok=True)
    final = _result_dir(asset.fill.id)
    pending = root / f"{asset.fill.id}.partial"
    shutil.rmtree(pending, ignore_errors=True)
    pending.mkdir()
    try:
        (pending / _RESULT_META).write_text(asset.fill.model_dump_json(indent=2), encoding="utf-8")
        (pending / _RESULT_OWNER).write_text(json.dumps({"media": str(media)}), encoding="utf-8")
        (pending / _RESULT_GENERATED).write_bytes(_png_bytes(asset.generated))
        (pending / _RESULT_BLEND).write_bytes(_png_bytes(asset.blend))
        os.replace(pending, final)
    finally:
        shutil.rmtree(pending, ignore_errors=True)


def _open_png(data: bytes, mode: str) -> Image.Image:
    with Image.open(io.BytesIO(data)) as opened:
        opened.load()
        return opened.convert(mode)


def _asset_from(meta: bytes, generated: bytes, blend: bytes) -> FillAsset:
    fill = ImageFill.model_validate_json(meta)
    generated_image = _open_png(generated, "RGBA")
    blend_image = _open_png(blend, "L")
    size = (fill.box.width, fill.box.height)
    if generated_image.size != size or blend_image.size != size:
        raise ValueError("The stored fill pixels do not match their crop")
    return FillAsset(fill=fill, generated=generated_image, blend=blend_image)


def load_result(media: Path, fill_id: str) -> FillAsset | None:
    """A temporary result made for this same file, or None."""
    folder = _result_dir(fill_id)
    try:
        owner = json.loads((folder / _RESULT_OWNER).read_text(encoding="utf-8"))
        if not isinstance(owner, dict) or not _same_media(str(owner.get("media")), media):
            return None
        return _asset_from(
            (folder / _RESULT_META).read_bytes(),
            (folder / _RESULT_GENERATED).read_bytes(),
            (folder / _RESULT_BLEND).read_bytes(),
        )
    except (OSError, ValueError, UnidentifiedImageError):
        return None


def discard_result(media: Path, fill_id: str) -> None:
    """Drop an unkept result. A result made for another file is not this caller's to drop."""
    folder = _result_dir(fill_id)
    try:
        owner = json.loads((folder / _RESULT_OWNER).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return
    if isinstance(owner, dict) and _same_media(str(owner.get("media")), media):
        shutil.rmtree(folder, ignore_errors=True)


def sweep_results(active: set[str], *, now: float | None = None) -> None:
    """Remove results past retention. ``active`` names generations still writing theirs."""
    root = results_root()
    cutoff = (now if now is not None else time.time()) - FILL_RESULT_RETENTION_SECONDS
    with suppress(OSError):
        for entry in root.iterdir():
            fill_id = entry.name.removesuffix(".partial")
            if fill_id in active:
                continue
            with suppress(OSError):
                if entry.stat().st_mtime < cutoff:
                    shutil.rmtree(entry, ignore_errors=True)


def _archive_names(fill_id: str) -> tuple[str, str, str]:
    return (
        f"{fill_id}/{_RESULT_META}",
        f"{fill_id}/{_RESULT_GENERATED}",
        f"{fill_id}/{_RESULT_BLEND}",
    )


def _read_archive(media: Path) -> dict[str, FillAsset]:
    path = fill_assets_path(media)
    if not path.is_file():
        return {}
    assets: dict[str, FillAsset] = {}
    try:
        with zipfile.ZipFile(path) as archive:
            names = set(archive.namelist())
            for name in names:
                fill_id, _, leaf = name.partition("/")
                if leaf != _RESULT_META:
                    continue
                meta, generated, blend = _archive_names(fill_id)
                if generated not in names or blend not in names:
                    continue
                try:
                    asset = _asset_from(
                        archive.read(meta), archive.read(generated), archive.read(blend)
                    )
                except (ValueError, UnidentifiedImageError, OSError):
                    logger.warning("Skipping an unreadable fill in %s", path.name, exc_info=True)
                    continue
                assets[asset.fill.id] = asset
    except (OSError, zipfile.BadZipFile):
        logger.warning("Cannot read the fill archive %s", path.name, exc_info=True)
        return {}
    return assets


def write_archive(media: Path, assets: Iterable[FillAsset]) -> None:
    """Replace the archive with exactly ``assets``; with none, remove it. Needs the media claim."""
    path = fill_assets_path(media)
    unique = {asset.fill.id: asset for asset in assets}
    if not unique:
        with suppress(OSError):
            path.unlink(missing_ok=True)
        return

    buffer = io.BytesIO()
    # Stored: the PNGs are compressed already.
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_STORED) as archive:
        for fill_id, asset in unique.items():
            meta, generated, blend = _archive_names(fill_id)
            archive.writestr(meta, asset.fill.model_dump_json(indent=2))
            archive.writestr(generated, _png_bytes(asset.generated))
            archive.writestr(blend, _png_bytes(asset.blend))
    data = buffer.getvalue()
    # A preview may have the archive open for a moment; Windows refuses to replace it until then.
    retry_while_locked(partial(write_bytes_atomic, path, data))


def resolve_fill_chain(media: Path, fills: list[ImageFill], source_digest: str) -> list[FillAsset]:
    """The stored pixels behind ``fills``, refusing anything stale, foreign or missing.

    Saved fills come from the archive, kept-but-unapplied ones from the temporary results.
    """
    if not fills:
        return []

    archived = _read_archive(media)
    resolved: list[FillAsset] = []
    for position, fill in enumerate(fills, start=1):
        asset = archived.get(fill.id) or load_result(media, fill.id)
        if asset is None:
            raise FillUnavailableError(
                f"The pixels of fill {position} are no longer stored. Remove it and the fills "
                "after it, then generate them again."
            )
        if asset.fill != fill:
            raise FillUnavailableError(
                f"Fill {position} does not match what was generated. Reopen the editor."
            )
        if fill.source_digest != source_digest:
            raise FillUnavailableError(
                "The original changed since these fills were generated. Remove them and generate "
                "them again."
            )
        resolved.append(asset)
    return resolved


def resolve_fill_ids(media: Path, fill_ids: list[str], source_digest: str) -> list[FillAsset]:
    """:func:`resolve_fill_chain` for a preview, which names the chain by id alone."""
    archived = _read_archive(media) if fill_ids else {}
    resolved: list[FillAsset] = []
    parent: str | None = None
    for position, fill_id in enumerate(fill_ids, start=1):
        asset = archived.get(fill_id) or load_result(media, fill_id)
        if asset is None:
            raise FillUnavailableError(f"The pixels of fill {position} are no longer stored.")
        if asset.fill.parent_id != parent:
            raise FillUnavailableError("These fills were not generated on top of each other.")
        if asset.fill.source_digest != source_digest:
            raise FillUnavailableError("The original changed since these fills were generated.")
        resolved.append(asset)
        parent = fill_id
    return resolved


def preview_png_bytes(image: Image.Image) -> bytes:
    """A fast lossless encode for the editor; an opaque frame drops its unused alpha."""
    prepared = image.convert("RGB") if is_opaque(image) else image
    buffer = io.BytesIO()
    prepared.save(buffer, format="PNG", compress_level=1)
    return buffer.getvalue()


def archived_assets(media: Path, fills: Iterable[ImageFill]) -> list[FillAsset]:
    """What the archive still holds of ``fills``; for keeping the saved edit reopenable."""
    archived = _read_archive(media)
    return [archived[fill.id] for fill in fills if fill.id in archived]
