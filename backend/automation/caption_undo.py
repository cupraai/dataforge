"""Taking back what a bulk caption job wrote, caption by caption.

Each record is the bytes a write replaced and the revision it left. A caption that is no longer
that revision was edited after the job, so it is reported as changed and left alone.
"""

from __future__ import annotations

import base64
from pathlib import Path

from captions import CaptionUndo, restore_caption
from media_claims import MediaBusyError


def undo_records(undos: list[CaptionUndo]) -> list[dict[str, object]]:
    """The stored form: JSON, so the replaced bytes travel as base64."""
    return [
        {
            "path": str(undo.media_path),
            "previous": None if undo.previous is None else base64.b64encode(undo.previous).decode(),
            "revision": undo.revision,
        }
        for undo in undos
    ]


def _from_record(record: dict[str, object]) -> CaptionUndo:
    previous = record.get("previous")
    revision = record.get("revision")
    return CaptionUndo(
        Path(str(record["path"])),
        base64.b64decode(previous) if isinstance(previous, str) else None,
        revision if isinstance(revision, str) else None,
    )


def undo_caption_writes(
    records: list[dict[str, object]],
) -> tuple[dict[str, object], list[dict[str, object]]]:
    """The outcome per caption, and the records of failed restores, which a retry can take again."""
    restored: list[str] = []
    changed: list[str] = []
    failed: list[dict[str, str]] = []
    retry: list[dict[str, object]] = []
    for record in records:
        undo = _from_record(record)
        try:
            (restored if restore_caption(undo) else changed).append(str(undo.media_path))
        except (OSError, MediaBusyError) as exc:
            failed.append({"path": str(undo.media_path), "detail": str(exc)})
            retry.append(record)
    return {"restored": restored, "changed": changed, "failed": failed}, retry
