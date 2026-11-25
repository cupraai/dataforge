"""How each folder's gallery is shown: display mode and sort, remembered per folder."""

from __future__ import annotations

from typing import cast, get_args

from pydantic import BaseModel, Field

from constants import DEFAULT_GALLERY_SORT
from filesystem import preference_folder_key
from preferences import JsonPreference
from schemas import GalleryDisplayMode, GalleryDisplaySettingsResponse, GallerySort

GALLERY_DISPLAY_SETTINGS_KEY = "gallery_display_settings"

# PEP 695 aliases: ``get_args`` on the alias itself returns empty and would reject every value.
VALID_MODES = frozenset(get_args(GalleryDisplayMode.__value__))
VALID_SORTS = frozenset(get_args(GallerySort.__value__))
DEFAULT_MODE: GalleryDisplayMode = "large"
DEFAULT_SORT: GallerySort = DEFAULT_GALLERY_SORT

__all__ = [
    "GALLERY_DISPLAY_SETTINGS_KEY",
    "forget_folder_views",
    "get_gallery_display_settings",
    "preference_folder_key",
    "remembered_folder_count",
    "update_gallery_display_settings",
]


class GalleryDisplayStoredSettings(BaseModel):
    """Defaults are never stored, or the maps would grow with every folder visited."""

    mode_by_folder: dict[str, GalleryDisplayMode] = Field(default_factory=dict)
    sort_by_folder: dict[str, GallerySort] = Field(default_factory=dict)


_settings: JsonPreference[GalleryDisplayStoredSettings] = JsonPreference(
    GALLERY_DISPLAY_SETTINGS_KEY, GalleryDisplayStoredSettings
)


def _response_for(
    stored: GalleryDisplayStoredSettings,
    folder_key: str,
) -> GalleryDisplaySettingsResponse:
    return GalleryDisplaySettingsResponse(
        mode=stored.mode_by_folder.get(folder_key, DEFAULT_MODE),
        sort=stored.sort_by_folder.get(folder_key, DEFAULT_SORT),
        folder_path=folder_key,
    )


def get_gallery_display_settings(*, folder_path: str) -> GalleryDisplaySettingsResponse:
    return _response_for(_settings.get(), preference_folder_key(folder_path))


def _remembered[T: str](
    choices: dict[str, T], folder_key: str, value: T | None, default: T
) -> dict[str, T]:
    """``None`` leaves the folder's entry as it was."""
    updated = dict(choices)
    if value == default:
        updated.pop(folder_key, None)
    elif value is not None:
        updated[folder_key] = value
    return updated


def update_gallery_display_settings(
    *,
    mode: str | None = None,
    sort: str | None = None,
    folder_path: str,
) -> GalleryDisplaySettingsResponse:
    """Unknown values are ignored."""
    stored = _settings.get()
    folder_key = preference_folder_key(folder_path)
    valid_mode = cast(GalleryDisplayMode, mode) if mode in VALID_MODES else None
    valid_sort = cast(GallerySort, sort) if sort in VALID_SORTS else None

    updated = stored.model_copy(
        update={
            "mode_by_folder": _remembered(
                stored.mode_by_folder, folder_key, valid_mode, DEFAULT_MODE
            ),
            "sort_by_folder": _remembered(
                stored.sort_by_folder, folder_key, valid_sort, DEFAULT_SORT
            ),
        }
    )
    return _response_for(_settings.save(updated), folder_key)


def remembered_folder_count() -> int:
    stored = _settings.get()
    return len(stored.mode_by_folder.keys() | stored.sort_by_folder.keys())


def forget_folder_views() -> None:
    _settings.update(mode_by_folder={}, sort_by_folder={})
