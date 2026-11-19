"""Delete a media file and its related files; leftovers are reported, not fatal."""

from __future__ import annotations

import os
from pathlib import Path

from constants import COMFY_STALE_SUFFIX, EDIT_STALE_SUFFIX
from file_trash import delete_path, deletes_to_trash, restore_from_trash
from media_claims import claim
from media_group import media_group_paths, shared_stem_paths


class MediaReappearedError(ValueError):
    """The media is back, so its related files belong to it again."""


def _publish_leftovers(media: Path) -> list[Path]:
    """A later sweep would move it back onto the name."""
    stale = (
        media.with_name(f"{media.name}{suffix}")
        for suffix in (EDIT_STALE_SUFFIX, COMFY_STALE_SUFFIX)
    )
    return [path for path in stale if path.is_file()]


def _delete_each(paths: list[Path]) -> tuple[list[Path], list[dict[str, str]]]:
    deleted: list[Path] = []
    retained: list[dict[str, str]] = []
    for path in paths:
        try:
            delete_path(path)
            deleted.append(path)
        except OSError as exc:
            retained.append({"path": str(path), "message": str(exc)})
    return deleted, retained


def _owned_paths(media: Path) -> set[str]:
    """Not shared with a same-stem sibling; normcased."""
    owned = {os.path.normcase(path) for path in media_group_paths(media)[1:]}
    owned |= {os.path.normcase(path) for path in _publish_leftovers(media)}
    return owned - {os.path.normcase(path) for path in shared_stem_paths(media)}


def delete_media_with_sidecars(file_path: Path) -> dict[str, object]:
    # The candidate is found by pairing against the file itself.
    group = media_group_paths(file_path)
    with claim(group, "delete"):
        media, *related = group
        shared = shared_stem_paths(file_path)

        try:
            delete_path(media)
        except OSError as exc:
            raise OSError(f"Failed to delete {file_path.name}: {exc}") from exc

        deleted, retained = _delete_each(
            [path for path in related if path not in shared] + _publish_leftovers(file_path)
        )

    # Media first, as `restore_media_with_sidecars` takes them.
    recycled = [str(path) for path in (file_path, *deleted)] if deletes_to_trash() else []
    return {
        "path": str(file_path),
        "deleted": [file_path.name, *(path.name for path in deleted)],
        "retained": retained,
        "recycled": recycled,
    }


def delete_leftovers(media: Path, paths: list[Path]) -> dict[str, object]:
    """Retry deleting leftovers still tied to ``media`` and not shared with a sibling."""
    group = media_group_paths(media)
    with claim(group, "delete"):
        if media.exists():
            raise MediaReappearedError(f"{media.name} exists again, so its files belong to it")

        owned = _owned_paths(media)
        foreign = next((path for path in paths if os.path.normcase(path) not in owned), None)
        if foreign is not None:
            raise ValueError(f"{foreign.name} is not a file {media.name} left behind")

        deleted, retained = _delete_each(paths)

    return {
        "path": str(media),
        "deleted": [path.name for path in deleted],
        "retained": retained,
        "recycled": [str(path) for path in deleted] if deletes_to_trash() else [],
    }


def restore_media_with_sidecars(media: Path, related: list[Path]) -> dict[str, object]:
    """Undo a delete; restored files not tied to ``media`` go back to the bin."""
    restored: list[str] = []
    missing: list[str] = []
    failed: list[dict[str, str]] = []
    with claim([media, *related], "restore"):
        try:
            if not restore_from_trash(media):
                return {"restored": [], "missing": [str(media)], "failed": []}
        except OSError as exc:
            return {
                "restored": [],
                "missing": [],
                "failed": [{"path": str(media), "detail": str(exc)}],
            }
        restored.append(str(media))

        for path in related:
            try:
                if not restore_from_trash(path):
                    missing.append(str(path))
                    continue
                if os.path.normcase(path) not in _owned_paths(media):
                    delete_path(path)
                    failed.append({"path": str(path), "detail": f"Not a file of {media.name}"})
                    continue
            except OSError as exc:
                failed.append({"path": str(path), "detail": str(exc)})
                continue
            restored.append(str(path))

    return {"restored": restored, "missing": missing, "failed": failed}
