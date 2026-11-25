from __future__ import annotations

from preferences import JsonPreference
from schemas import (
    DesktopNotificationLevel,
    EditorSettings,
    GalleryCardSettings,
    JobsDialogFilters,
    ThemePreference,
    UiSettingsResponse,
)

UI_SETTINGS_KEY = "ui_settings"

_settings: JsonPreference[UiSettingsResponse] = JsonPreference(UI_SETTINGS_KEY, UiSettingsResponse)

# Listings and every watch pass ask, so they read a snapshot instead of the database.
_tagging_enabled = False


def get_ui_settings() -> UiSettingsResponse:
    return _settings.get()


def load_tagging_switch() -> None:
    global _tagging_enabled
    _tagging_enabled = get_ui_settings().tagging_enabled


def tagging_enabled() -> bool:
    return _tagging_enabled


def update_ui_settings(
    *,
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
