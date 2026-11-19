"""Target frame sizes for a megapixel budget on a pixel grid; mirrored by the frontend."""

from __future__ import annotations

from math import floor, lcm, sqrt

from constants import MEGAPIXEL
from schemas import SizeFit


def _round_half_up(value: float) -> int:
    """``Math.round``, not banker's rounding, so both ports agree on a ``.5``."""
    return floor(value + 0.5)


def grid_multiple(fit: SizeFit, *, even: bool = False) -> int:
    """``even`` for video: ``yuv420p`` has no odd sizes, so the grid widens to a multiple of 2."""
    return lcm(fit.multiple, 2) if even else fit.multiple


def fitted_size(
    size: tuple[int, int], fit: SizeFit, *, even: bool = False
) -> tuple[int, int] | None:
    """The budget at ``size``'s aspect on the grid; ``None`` below one cell."""
    width, height = size
    multiple = grid_multiple(fit, even=even)
    if width <= 0 or height <= 0:
        return None
    largest = (width // multiple * multiple, height // multiple * multiple)
    if min(largest) == 0:
        return None

    scale = min(1.0, sqrt(fit.megapixels * MEGAPIXEL / (width * height)))
    target = (
        _round_half_up(width * scale / multiple) * multiple,
        _round_half_up(height * scale / multiple) * multiple,
    )
    return (
        max(multiple, min(target[0], largest[0])),
        max(multiple, min(target[1], largest[1])),
    )


def cover_size(size: tuple[int, int], target: tuple[int, int]) -> tuple[int, int]:
    """The even size covering ``target`` at ``size``'s aspect, for a center crop; floored."""
    width, height = size
    scale = max(target[0] / width, target[1] / height)
    return (
        max(target[0], floor(width * scale / 2) * 2),
        max(target[1], floor(height * scale / 2) * 2),
    )
