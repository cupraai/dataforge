from __future__ import annotations

import filecmp
import logging
import os
import shutil
from functools import partial
from pathlib import Path

from fastapi import HTTPException

from candidate_pairing import candidate_path_for
from comfy_candidates import read_candidate_sidecar, write_candidate_sidecar
from file_write import retry_while_locked
from filesystem import sanitize_entry_name
from media_claims import claim
from media_group import group_target, media_group_paths, shared_stem_paths
from path_resolve import resolve_path

logger = logging.getLogger(__name__)

#: So no listing mistakes it for a media file.
RENAME_TEMP_PREFIX = ".__df_rename_media_"


def _repoint_candidate_record(source_media: Path, target_media: Path) -> None:
    """Processing refuses a candidate whose name disagrees."""
    candidate = candidate_path_for(target_media)
    record = read_candidate_sidecar(candidate) if candidate is not None else None
    if candidate is None or record is None or record.source_name != source_media.name:
        return
    write_candidate_sidecar(candidate, record.model_copy(update={"source_name": target_media.name}))


def rename_media_group(source_media: Path, target_media: Path) -> None:
    """Shared files are copied; an identical one already there merges."""
    if source_media == target_media:
        # Every sidecar would compare equal to itself.
        return
    shared = shared_stem_paths(source_media)
    # (original, target, copied): a copy is undone by removing it.
    renamed: list[tuple[Path, Path, bool]] = []
    try:
        for path in media_group_paths(source_media):
            target = group_target(source_media, target_media, path)
            if path in shared:
                shutil.copy2(path, target)
                renamed.append((path, target, True))
            elif path != source_media and target.is_file() and filecmp.cmp(path, target, False):
                # A sibling renamed earlier already carried this file here.
                retry_while_locked(path.unlink)
            else:
                retry_while_locked(partial(path.rename, target))
                renamed.append((path, target, False))
        _repoint_candidate_record(source_media, target_media)
    except OSError:
        for original, target, copied in reversed(renamed):
            try:
                if copied:
                    retry_while_locked(partial(target.unlink, missing_ok=True))
                else:
                    retry_while_locked(partial(target.rename, original))
            except OSError:
                logger.exception("Failed to restore %s from %s", original, target)
        raise


def _check_target_conflict(target_path: Path, moving_sources: set[Path]) -> None:
    if not target_path.exists():
        return
    if resolve_path(target_path) in moving_sources:
        return
    raise ValueError(f'Cannot rename files: "{target_path.name}" already exists in this folder.')


def check_rename_conflicts(media: Path, target_media: Path, moving_sources: set[Path]) -> None:
    """Raises ``ValueError`` if a group file would land on one that stays."""
    _check_target_conflict(target_media, moving_sources)

    for related in media_group_paths(media):
        if related == media:
            continue
        _check_target_conflict(group_target(media, target_media, related), moving_sources)

    candidate = candidate_path_for(media)
    if candidate is not None:
        renamed = group_target(media, target_media, candidate)
        # A same-named folder file would own the candidate.
        if renamed.name != target_media.name:
            _check_target_conflict(target_media.parent / renamed.name, moving_sources)


def _rename_by_case_only(source_media: Path, target_media: Path) -> None:
    """Case-insensitive disks see both names as equal."""
    hop = source_media.with_name(f"{RENAME_TEMP_PREFIX}{source_media.name}")
    rename_media_group(source_media, hop)
    try:
        rename_media_group(hop, target_media)
    except OSError:
        rename_media_group(hop, source_media)
        raise


def rename_media_file(source: Path, stem: str) -> dict[str, str]:
    if sanitize_entry_name(stem) is None:
        raise HTTPException(status_code=400, detail="Invalid file name")

    target = source.with_name(stem + source.suffix)
    result = {"source": str(source), "destination": str(target)}
    # Paths compare equal across a change of case on Windows.
    if target.name == source.name:
        return result

    group = media_group_paths(source)
    try:
        # A running render or accept would write back under the old name.
        with claim([*group, target], "rename"):
            check_rename_conflicts(source, target, {resolve_path(path) for path in group})
            if os.path.normcase(target) == os.path.normcase(source):
                _rename_by_case_only(source, target)
            else:
                rename_media_group(source, target)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to rename {source.name}: {exc}"
        ) from exc

    return result
