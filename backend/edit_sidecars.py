"""Edit state per whole filename: ``.bak`` original, ``.edit.json`` record, ``.fills`` archive."""

from __future__ import annotations

import json
import logging
import os
import shutil
from contextlib import suppress
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ValidationError

from constants import (
    EDIT_BACKUP_SUFFIX,
    EDIT_SIDECAR_SUFFIX,
    EDIT_STALE_SUFFIX,
    EDIT_TEMP_SUFFIX,
    FILL_ASSETS_SUFFIX,
)
from file_publish import (
    copy_creation_time,
    publish_replacing,
    sweep_publish_leftovers,
    unlink_quietly,
)
from file_trash import delete_path
from file_write import write_text_atomic
from media_claims import holds_claim, is_claimed

logger = logging.getLogger(__name__)

NO_BACKUP_MESSAGE = "No original is stored for this file"


class PublishedFingerprint(BaseModel):
    """Nanosecond mtimes do not survive a browser."""

    size: int
    modified_us: int


class EditRecord(BaseModel):
    spec: dict[str, Any]
    published: PublishedFingerprint


def backup_path_for(media: Path) -> Path:
    return media.with_name(f"{media.name}{EDIT_BACKUP_SUFFIX}")


def edit_spec_path(media: Path) -> Path:
    return media.with_name(f"{media.name}{EDIT_SIDECAR_SUFFIX}")


def fill_assets_path(media: Path) -> Path:
    return media.with_name(f"{media.name}{FILL_ASSETS_SUFFIX}")


def temp_path_for(media: Path) -> Path:
    return media.with_name(f"{media.name}{EDIT_TEMP_SUFFIX}")


def stale_path_for(media: Path) -> Path:
    return media.with_name(f"{media.name}{EDIT_STALE_SUFFIX}")


def fingerprint_of(path: Path) -> PublishedFingerprint:
    stat = path.stat()
    return PublishedFingerprint(size=stat.st_size, modified_us=stat.st_mtime_ns // 1000)


def _read_record(media: Path) -> EditRecord | None:
    path = edit_spec_path(media)
    try:
        return EditRecord.model_validate_json(path.read_bytes())
    except OSError:
        return None
    except ValidationError:
        logger.warning("Ignoring unreadable edit record %s", path.name, exc_info=True)
        return None


def _write_record(media: Path, record: EditRecord) -> None:
    write_text_atomic(edit_spec_path(media), json.dumps(record.model_dump(), indent=2))


def _is_replaced(media: Path, record: EditRecord | None) -> bool:
    """Without a record the backup is trusted."""
    if record is None:
        return False
    try:
        return fingerprint_of(media) != record.published
    except OSError:
        return False


def _kept_backup(media: Path) -> Path | None:
    """``None`` when it no longer belongs to the live file."""
    backup = backup_path_for(media)
    if not backup.is_file() or _is_replaced(media, _read_record(media)):
        return None
    return backup


def has_backup(media: Path) -> bool:
    return _kept_backup(media) is not None


def original_path_for(media: Path) -> Path:
    """The kept backup, else the live file."""
    return _kept_backup(media) or media


def read_spec[SpecT: BaseModel](media: Path, model: type[SpecT]) -> SpecT | None:
    """``None`` for an unedited, unreadable or externally replaced file."""
    record = _read_record(media)
    if record is None or _is_replaced(media, record):
        return None
    try:
        return model.model_validate(record.spec)
    except ValidationError:
        logger.warning("Ignoring an edit spec %s cannot read", model.__name__, exc_info=True)
        return None


def _require_claim(media: Path) -> None:
    if not holds_claim(media):
        raise RuntimeError(f"{media.name} was written without claiming it")


def discard_edit_state(media: Path) -> None:
    """Send the backup, record and fill pixels to the bin."""
    for path in (backup_path_for(media), edit_spec_path(media), fill_assets_path(media)):
        if path.is_file():
            delete_path(path)


def adopt_if_replaced(media: Path) -> bool:
    """Make an externally replaced live file the new original; True if it was replaced."""
    _require_claim(media)
    if not backup_path_for(media).is_file() or not _is_replaced(media, _read_record(media)):
        return False
    logger.info("%s changed outside DataForge; adopting it as the original", media.name)
    discard_edit_state(media)
    return True


def refresh_published(media: Path) -> None:
    """Record an in-app rewrite that kept its edit lineage; no edit state needs no claim."""
    record = _read_record(media)
    if record is None:
        return
    _require_claim(media)
    _write_record(media, record.model_copy(update={"published": fingerprint_of(media)}))


def _keep_creation_time(media: Path, temp_path: Path) -> None:
    """An edit rewrites the file the user already has, so only its modified date may move."""
    try:
        copy_creation_time(media, temp_path)
    except OSError:
        logger.warning("Could not keep the creation date of %s", media.name, exc_info=True)


def publish_with_spec(temp_path: Path, media: Path, spec: BaseModel) -> None:
    """The record goes first, so a failure leaves either the old or the new pair."""
    _require_claim(media)
    _keep_creation_time(media, temp_path)
    spec_path = edit_spec_path(media)
    try:
        previous = spec_path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        previous = None

    _write_record(media, EditRecord(spec=spec.model_dump(), published=fingerprint_of(temp_path)))
    try:
        publish_replacing(temp_path, media, stale_path_for(media))
    except Exception:
        with suppress(OSError):
            if previous is None:
                spec_path.unlink(missing_ok=True)
            else:
                write_text_atomic(spec_path, previous)
        raise


def sweep_edit_temp_files(folder: Path) -> None:
    sweep_publish_leftovers(
        folder, temp_suffix=EDIT_TEMP_SUFFIX, stale_suffix=EDIT_STALE_SUFFIX, is_busy=is_claimed
    )


@dataclass(frozen=True)
class EditStart:
    #: The file to render from.
    source: Path
    #: Replaced outside DataForge and now the original.
    adopted: bool


def begin_edit(media: Path) -> EditStart:
    """The backup is a copy, never a rename, so a streamed path never vanishes."""
    adopted = adopt_if_replaced(media)
    sweep_edit_temp_files(media.parent)

    backup = backup_path_for(media)
    if not backup.exists():
        pending = backup.with_name(f"{backup.name}-tmp")
        try:
            shutil.copy2(media, pending)
            os.replace(pending, backup)
        finally:
            unlink_quietly(pending)

    return EditStart(source=backup, adopted=adopted)


def restore_backup(media: Path) -> bool:
    """False when the live file was replaced outside DataForge and adopted."""
    if adopt_if_replaced(media):
        return False

    backup = backup_path_for(media)
    if not backup.is_file():
        raise ValueError(NO_BACKUP_MESSAGE)

    sweep_edit_temp_files(media.parent)
    temp_path = temp_path_for(media)

    try:
        shutil.copy2(backup, temp_path)
        _keep_creation_time(media, temp_path)
        publish_replacing(temp_path, media, stale_path_for(media))
    finally:
        unlink_quietly(temp_path)

    unlink_quietly(backup)
    unlink_quietly(edit_spec_path(media))
    unlink_quietly(fill_assets_path(media))
    return True
