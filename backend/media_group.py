"""Every file tied to a media file by name, so rename, move and delete keep them together."""

from __future__ import annotations

import os
from pathlib import Path

from candidate_pairing import candidate_path_for, candidate_sidecar_path
from captions import issue_file_path
from constants import (
    CAPTION_BACKUP_DIR_NAME,
    CAPTION_SIDECAR_EXTENSIONS,
    CAPTIONED_EXTENSIONS,
    SIDECAR_EXTENSIONS,
)
from duplicates import duplicate_file_path
from edit_sidecars import backup_path_for, edit_spec_path, fill_assets_path
from folder_scan import is_model_path
from video_project import snapshot_path_for


def media_group_paths(media: Path) -> list[Path]:
    """The media file first, then each related file; a model file takes no caption."""
    paths = [media]
    captioned = not is_model_path(media)

    for extension in sorted(SIDECAR_EXTENSIONS) if captioned else ():
        sidecar = media.with_suffix(extension)
        if sidecar.is_file():
            paths.append(sidecar)

    # Two suffixes deep, or keyed by the whole filename.
    for extra in (
        issue_file_path(media),
        duplicate_file_path(media),
        backup_path_for(media),
        edit_spec_path(media),
        fill_assets_path(media),
        snapshot_path_for(media),
    ):
        if extra.is_file():
            paths.append(extra)

    backup_dir = media.parent / CAPTION_BACKUP_DIR_NAME
    for extension in CAPTION_SIDECAR_EXTENSIONS if captioned else ():
        backed_up = backup_dir / f"{media.stem}{extension}"
        if backed_up.is_file():
            paths.append(backed_up)

    candidate = candidate_path_for(media)
    if candidate is not None:
        paths.append(candidate)
        record = candidate_sidecar_path(candidate)
        if record.is_file():
            paths.append(record)

    return paths


def stem_siblings(media: Path) -> list[Path]:
    """Other captioned files with this stem; they share its caption."""
    stem = os.path.normcase(media.stem)
    try:
        entries = list(media.parent.iterdir())
    except OSError:
        return []
    return [
        entry
        for entry in entries
        if entry.name != media.name
        and entry.suffix.lower() in CAPTIONED_EXTENSIONS
        and os.path.normcase(entry.stem) == stem
        and entry.is_file()
    ]


def stem_keyed_paths(media: Path) -> set[Path]:
    """Only the caption and its backup; the rest is keyed by the whole filename."""
    backup_dir = media.parent / CAPTION_BACKUP_DIR_NAME
    return {
        *(media.with_suffix(extension) for extension in SIDECAR_EXTENSIONS),
        *(backup_dir / f"{media.stem}{extension}" for extension in CAPTION_SIDECAR_EXTENSIONS),
    }


def shared_stem_paths(media: Path) -> set[Path]:
    """:func:`stem_keyed_paths` while a sibling shares them; empty for a lone file."""
    return stem_keyed_paths(media) if stem_siblings(media) else set()


def sidecar_suffix(media: Path, related: Path) -> str:
    """``Path.suffix`` reads ``photo.issue.json`` as ``.json``."""
    return related.name[len(media.stem) :]


def group_target(media: Path, target_media: Path, related: Path) -> Path:
    """Where ``related`` lands when ``media`` is renamed, keeping its subfolder."""
    if related == media:
        return target_media
    name = target_media.stem + sidecar_suffix(media, related)
    return target_media.parent / related.parent.relative_to(media.parent) / name
