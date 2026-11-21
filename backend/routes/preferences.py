from fastapi import APIRouter, HTTPException, Query

import automation_settings
import gallery_display_settings
import saved_snippets
from automation_settings import get_automation_settings
from gallery_display_settings import (
    get_gallery_display_settings,
    update_gallery_display_settings,
)
from schemas import (
    AutomationSettingsResponse,
    GalleryDisplaySettingsResponse,
    GalleryDisplaySettingsUpdate,
    RememberedDataResponse,
    SavedSnippet,
    SavedSnippetsResponse,
    SnippetBook,
    UiSettingsResponse,
    UiSettingsUpdate,
)
from tagging_worker import wake_tagging_worker
from ui_settings import get_ui_settings, update_ui_settings

router = APIRouter()


@router.get("/preferences/ui", response_model=UiSettingsResponse)
def read_ui_settings() -> UiSettingsResponse:
    return get_ui_settings()


@router.put("/preferences/ui", response_model=UiSettingsResponse)
def write_ui_settings(body: UiSettingsUpdate) -> UiSettingsResponse:
    saved = update_ui_settings(
        sort=body.sort,
        show_automation_specs=body.show_automation_specs,
        theme=body.theme,
        keep_candidate_metadata=body.keep_candidate_metadata,
        jobs_drawer_filters=body.jobs_drawer_filters,
        gallery_cards=body.gallery_cards,
        editor=body.editor,
        hide_hidden_folders=body.hide_hidden_folders,
        tagging_enabled=body.tagging_enabled,
        desktop_notifications=body.desktop_notifications,
        desktop_notification_level=body.desktop_notification_level,
    )
    if body.tagging_enabled is not None:
        wake_tagging_worker()
    return saved


@router.get("/preferences/gallery-display", response_model=GalleryDisplaySettingsResponse)
def read_gallery_display_settings(
    path: str = Query(..., description="Folder path; the display mode is returned for this folder"),
) -> GalleryDisplaySettingsResponse:
    return get_gallery_display_settings(folder_path=path)


@router.put("/preferences/gallery-display", response_model=GalleryDisplaySettingsResponse)
def write_gallery_display_settings(
    body: GalleryDisplaySettingsUpdate,
) -> GalleryDisplaySettingsResponse:
    return update_gallery_display_settings(mode=body.mode, folder_path=body.folder_path)


@router.get("/preferences/automation", response_model=AutomationSettingsResponse)
def read_automation_settings(
    path: str = Query(..., description="Folder path; each job's settings are returned for it"),
) -> AutomationSettingsResponse:
    """Settings are stored by the job-start routes."""
    return get_automation_settings(folder_path=path)


def _remembered() -> RememberedDataResponse:
    return RememberedDataResponse(
        job_option_folders=automation_settings.remembered_folder_count(),
        display_mode_folders=gallery_display_settings.remembered_folder_count(),
    )


@router.get("/preferences/remembered", response_model=RememberedDataResponse)
def read_remembered_data() -> RememberedDataResponse:
    return _remembered()


@router.delete("/preferences/remembered/job-options", response_model=RememberedDataResponse)
def forget_job_options() -> RememberedDataResponse:
    automation_settings.forget_folder_settings()
    return _remembered()


@router.delete("/preferences/remembered/display-modes", response_model=RememberedDataResponse)
def forget_display_modes() -> RememberedDataResponse:
    gallery_display_settings.forget_folder_modes()
    return _remembered()


@router.get("/preferences/snippets/{book}", response_model=SavedSnippetsResponse)
def read_saved_snippets(book: SnippetBook) -> SavedSnippetsResponse:
    return saved_snippets.list_snippets(book)


@router.put("/preferences/snippets/{book}", response_model=SavedSnippetsResponse)
def save_saved_snippet(book: SnippetBook, body: SavedSnippet) -> SavedSnippetsResponse:
    try:
        return saved_snippets.save_snippet(book, body)
    except saved_snippets.TooManySnippetsError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.delete("/preferences/snippets/{book}", response_model=SavedSnippetsResponse)
def delete_saved_snippet(
    book: SnippetBook,
    name: str = Query(..., description="The saved snippet's name, matched ignoring case"),
) -> SavedSnippetsResponse:
    return saved_snippets.delete_snippet(book, name)
