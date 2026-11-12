from __future__ import annotations

from typing import get_args

from constants import DEFAULT_GALLERY_SORT
from preferences import JsonPreference
from schemas import (
    DesktopNotificationLevel,
    EditorSettings,
    GalleryCardSettings,
    GallerySort,
    JobsDialogFilters,
    ThemePreference,
    UiSettingsResponse,
)

UI_SETTINGS_KEY = "ui_settings"
DEFAULT_SORT: GallerySort = DEFAULT_GALLERY_SORT
# PEP 695 alias: ``get_args`` on the alias itself returns empty and would reject every sort.
VALID_SORTS = frozenset(get_args(GallerySort.__value__))

_settings: JsonPreference[UiSettingsResponse] = JsonPreference(UI_SETTINGS_KEY, UiSettingsResponse)

# Listings and every watch pass ask, so they read a snapshot instead of the database.
_tagging_enabled = False


def _normalized_sort(sort: str | None) -> str | None:
    """An unknown sort resets to the default rather than failing the request."""
    if sort is None:
        return None
    return sort if sort in VALID_SORTS else DEFAULT_SORT


def get_ui_settings() -> UiSettingsResponse:
    return _settings.get()


def load_tagging_switch() -> None:
    global _tagging_enabled
    _tagging_enabled = get_ui_settings().tagging_enabled


def tagging_enabled() -> bool:
    return _tagging_enabled


def update_ui_settings(
    *,
    sort: str | None = None,
    show_automation_specs: bool | None = None,
    theme: ThemePreference | None = None,
    keep_candidate_metadata: bool | None = None,
    jobs_drawer_filters: JobsDialogFilters | None = None,
    gallery_cards: GalleryCardSettings | None = None,
    editor: EditorSettings | None = None,
    hide_hidden_folders: bool | None = None,
    tagging_enabled: bool | None = None,
    desktop_notifications: bool | None = None,
    desktop_notification_level: DesktopNotificationLevel | None = None,
) -> UiSettingsResponse:
    global _tagging_enabled
    saved = _settings.update(
        sort=_normalized_sort(sort),
        show_automation_specs=show_automation_specs,
        theme=theme,
        keep_candidate_metadata=keep_candidate_metadata,
        jobs_drawer_filters=jobs_drawer_filters,
        gallery_cards=gallery_cards,
        editor=editor,
        hide_hidden_folders=hide_hidden_folders,
        tagging_enabled=tagging_enabled,
        desktop_notifications=desktop_notifications,
        desktop_notification_level=desktop_notification_level,
    )
    _tagging_enabled = saved.tagging_enabled
    return saved
