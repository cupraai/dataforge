"""Runs on a worker thread so it does not block the event loop."""

import logging
from pathlib import Path
from time import perf_counter

from fastapi import HTTPException

from candidate_pairing import candidate_name_for
from constants import (
    DUPLICATE_SIDECAR_SUFFIX,
    ISSUE_SIDECAR_SUFFIX,
    LAST_FOLDER_KEY,
    STAGING_DIR_NAME,
    WATERMARK_DIR_NAME,
)
from db import get_preference, set_preference
from filesystem import build_breadcrumbs, get_home_folder, list_subfolders
from folder_fingerprint import (
    folder_signature_from_scan,
    recall_folder_signature,
    remember_folder_signature,
)
from folder_note import read_folder_note
from folder_scan import scan_folder
from media_listing import list_media_from_scan, media_items_named
from path_resolve import resolve_path
from schemas import (
    FolderChangesResponse,
    FolderResponse,
    FolderReviewCountsResponse,
    SubfolderStats,
    SubfolderStatsResponse,
)

logger = logging.getLogger(__name__)


def _unreadable_folder() -> HTTPException:
    """Not an empty listing, which would misreport unreachable files."""
    return HTTPException(status_code=503, detail="This folder can't be read right now.")


def _remember_last_folder(folder: Path) -> None:
    """Change detection re-lists every few seconds."""
    value = str(folder)
    if get_preference(LAST_FOLDER_KEY) == value:
        return
    set_preference(LAST_FOLDER_KEY, value)


def build_folder_response(folder: Path, *, remember_last: bool = True) -> FolderResponse:
    started = perf_counter()
    if remember_last:
        _remember_last_folder(folder)

    parent = folder.parent
    parent_path = None if parent == folder else str(resolve_path(parent))

    scan = scan_folder(folder)
    if scan is None:
        raise _unreadable_folder()
    scanned = perf_counter()

    # Counts come from /api/folders/subfolder-stats.
    subfolders = [
        {"name": entry.name, "path": str(entry.path), "hidden": entry.hidden} for entry in scan.dirs
    ]
    items = list_media_from_scan(scan)
    signature = folder_signature_from_scan(scan)
    remember_folder_signature(folder, signature)
    listed = perf_counter()

    response = FolderResponse(
        path=str(folder),
        home=str(get_home_folder()),
        parent=parent_path,
        breadcrumbs=build_breadcrumbs(folder),
        subfolders=subfolders,
        items=items,
        has_sysprompt=scan.sysprompt is not None,
        sysprompt_applies=signature.flags.sysprompt_applies,
        has_caption_backup=signature.flags.has_caption_backup,
        has_caption_rules=scan.caption_rules is not None,
        note=read_folder_note(scan.note.path) if scan.note is not None else "",
        item_count=len(items),
        subfolder_count=len(subfolders),
        fingerprint=signature.fingerprint,
    )

    logger.debug(
        "folder %s: %d items, %d subfolders (scan %.3fs, list %.3fs, assemble %.3fs)",
        folder,
        len(items),
        len(subfolders),
        scanned - started,
        listed - scanned,
        perf_counter() - listed,
    )
    return response


def build_folder_fingerprint(folder: Path) -> str | None:
    """So a client adopting it can ask for changes since it."""
    scan = scan_folder(folder)
    if scan is None:
        return None

    signature = folder_signature_from_scan(scan)
    remember_folder_signature(folder, signature)
    return signature.fingerprint


def build_folder_changes(
    folder: Path, since: str, *, remember_last: bool = False
) -> FolderChangesResponse:
    """When there is no baseline, or a shell or flag changed."""
    if remember_last:
        _remember_last_folder(folder)
    scan = scan_folder(folder)
    if scan is None:
        raise _unreadable_folder()

    signature = folder_signature_from_scan(scan)
    remember_folder_signature(folder, signature)

    baseline = recall_folder_signature(folder, since)
    if baseline is None or baseline.shell != signature.shell or baseline.flags != signature.flags:
        return FolderChangesResponse(full=True, fingerprint=signature.fingerprint)

    changed = {name for name, item in signature.items.items() if baseline.items.get(name) != item}
    removed = sorted(baseline.items.keys() - signature.items.keys())

    return FolderChangesResponse(
        full=False,
        fingerprint=signature.fingerprint,
        changed=media_items_named(scan, changed),
        removed=[str(folder / name) for name in removed],
        stale_subfolders=[
            str(folder / name)
            for name, before, after in (
                (STAGING_DIR_NAME, baseline.staging, signature.staging),
                (WATERMARK_DIR_NAME, baseline.watermarked, signature.watermarked),
            )
            if before != after
        ],
    )


def build_folder_review_counts(folder: Path) -> FolderReviewCountsResponse:
    """By the listing's own pairing rule."""
    scan = scan_folder(folder)
    if scan is None:
        return FolderReviewCountsResponse(
            path=str(folder), issue_count=0, duplicate_count=0, candidate_count=0
        )
    return FolderReviewCountsResponse(
        path=str(folder),
        issue_count=sum(
            1 for entry in scan.media if scan.sidecar(entry.name, ISSUE_SIDECAR_SUFFIX) is not None
        ),
        duplicate_count=sum(
            1
            for entry in scan.media
            if scan.sidecar(entry.name, DUPLICATE_SIDECAR_SUFFIX) is not None
        ),
        candidate_count=sum(
            1
            for entry in scan.media
            if candidate_name_for(entry.name, scan.candidates, scan.files) is not None
        ),
    )


def build_subfolder_stats_response(folder: Path) -> SubfolderStatsResponse:
    started = perf_counter()
    subfolders = list_subfolders(folder)

    logger.debug(
        "subfolder stats %s: %d folders in %.3fs",
        folder,
        len(subfolders),
        perf_counter() - started,
    )
    return SubfolderStatsResponse(
        folder=str(folder),
        subfolders=[
            SubfolderStats(
                path=str(entry["path"]),
                file_count=int(entry["file_count"]),
                captioned_count=int(entry["captioned_count"]),
                issue_count=int(entry["issue_count"]),
                duplicate_count=int(entry["duplicate_count"]),
            )
            for entry in subfolders
        ],
    )
