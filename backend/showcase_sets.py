"""Saved showcase sets: items and inputs for a preset, reused for every LoRA showcased."""

from __future__ import annotations

from constants import MAX_SHOWCASE_SETS
from preferences import JsonPreference
from schemas import ComfyShowcaseSet, ComfyShowcaseSetsResponse

SHOWCASE_SETS_KEY = "comfy_showcase_sets"

_store: JsonPreference[ComfyShowcaseSetsResponse] = JsonPreference(
    SHOWCASE_SETS_KEY, ComfyShowcaseSetsResponse
)


class TooManyShowcaseSetsError(ValueError):
    pass


def _name_key(showcase: ComfyShowcaseSet) -> str:
    return showcase.name.casefold()


def _sorted(sets: list[ComfyShowcaseSet]) -> ComfyShowcaseSetsResponse:
    ordered: list[ComfyShowcaseSet] = sorted(sets, key=_name_key)
    return ComfyShowcaseSetsResponse(sets=ordered)


def list_showcase_sets() -> ComfyShowcaseSetsResponse:
    return _store.get()


def save_showcase_set(showcase: ComfyShowcaseSet) -> ComfyShowcaseSetsResponse:
    """Replaces a match ignoring case."""
    key = _name_key(showcase)
    others = [other for other in _store.get().sets if _name_key(other) != key]
    if len(others) >= MAX_SHOWCASE_SETS:
        raise TooManyShowcaseSetsError(
            f"At most {MAX_SHOWCASE_SETS} showcase sets can be saved. Delete one first."
        )
    return _store.save(_sorted([*others, showcase]))


def delete_showcase_set(name: str) -> ComfyShowcaseSetsResponse:
    """Removing an unsaved name changes nothing."""
    key = name.strip().casefold()
    return _store.save(_sorted([kept for kept in _store.get().sets if _name_key(kept) != key]))
