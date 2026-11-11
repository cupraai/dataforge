from fastapi import APIRouter

from routes import (
    automation,
    captions,
    duplicates,
    events,
    external_jobs,
    files,
    folder_contents,
    folder_instructions,
    folder_note,
    folders,
    health,
    jobs,
    media,
    notifications,
    preferences,
    settings,
    sidecars,
    system,
    video_projects,
    workflows,
)

router = APIRouter(prefix="/api")

for module in (
    automation,
    health,
    system,
    folders,
    folder_contents,
    folder_instructions,
    folder_note,
    media,
    captions,
    duplicates,
    sidecars,
    files,
    notifications,
    preferences,
    settings,
    jobs,
    external_jobs,
    events,
    video_projects,
    workflows,
):
    router.include_router(module.router)
