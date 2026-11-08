"""Tags the background tagger found per file, kept in SQLite rather than beside the media.

A row is keyed by folder and file name and remembers the file's ``mtime_ns`` and size, so an edited
or replaced file stops showing its old tags until it is tagged again. ``revision`` moves on every
write and feeds the folder fingerprint, which is what pushes new tags to an open gallery.
"""

from __future__ import annotations

import json
import os
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

from app_settings import effective_settings
from db import get_connection
from revisions import next_revision
from ui_settings import tagging_enabled

#: One stored tag: the vocabulary term and its best detection score, from 0 to 1.
StoredTag = tuple[str, float]

#: Stands in for the vocabulary of a row queued by Re-tag everything; no real id is empty.
RETAG_VOCABULARY = ""


@dataclass(frozen=True)
class TagRow:
    mtime_ns: int
    size: int
    #: Which model and vocabulary produced the tags. A new vocabulary leaves them be: only
    #: Re-tag everything sends a tagged file back to the model.
    vocabulary: str
    revision: int
    tags_json: str

    def matches(self, mtime_ns: int, size: int) -> bool:
        return self.mtime_ns == mtime_ns and self.size == size

    @property
    def queued_for_retag(self) -> bool:
        return self.vocabulary == RETAG_VOCABULARY

    def tags(self) -> list[StoredTag]:
        try:
            data = json.loads(self.tags_json)
        except json.JSONDecodeError:
            return []
        if not isinstance(data, list):
            return []
        return [
            (str(entry[0]), float(entry[1]))
            for entry in data
            if isinstance(entry, list) and len(entry) == 2
        ]


def folder_key(folder: Path) -> str:
    """Case-folded like the OS compares paths, so a favorite and a listing agree on one folder."""
    return os.path.normcase(str(folder))


def init_media_tags_table() -> None:
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS media_tags (
                folder TEXT NOT NULL,
                name TEXT NOT NULL,
                mtime_ns INTEGER NOT NULL,
                size INTEGER NOT NULL,
                vocabulary TEXT NOT NULL,
                revision INTEGER NOT NULL,
                tags TEXT NOT NULL,
                PRIMARY KEY (folder, name)
            )
            """
        )
        conn.commit()


def folder_tag_rows(folder: Path) -> dict[str, TagRow]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT name, mtime_ns, size, vocabulary, revision, tags
            FROM media_tags WHERE folder = ?
            """,
            (folder_key(folder),),
        ).fetchall()
    return {row[0]: TagRow(*row[1:]) for row in rows}


def listed_tag_rows(folder: Path) -> dict[str, TagRow]:
    """The rows a listing shows: none while tagging is off, though they are kept for turning on."""
    return folder_tag_rows(folder) if tagging_enabled() else {}


def folder_tag_revisions(folder: Path) -> dict[str, int]:
    """Only what the fingerprint needs; it runs on every watch pass, so the tags stay unparsed.

    Empty while tagging is off, like the listing it fingerprints.
    """
    if not tagging_enabled():
        return {}
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT name, revision FROM media_tags WHERE folder = ?",
            (folder_key(folder),),
        ).fetchall()
    return dict(rows)


def save_media_tags(
    folder: Path,
    name: str,
    *,
    mtime_ns: int,
    size: int,
    vocabulary: str,
    tags: Iterable[StoredTag],
) -> None:
    payload = json.dumps([[label, round(score, 4)] for label, score in tags])
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO media_tags (folder, name, mtime_ns, size, vocabulary, revision, tags)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(folder, name) DO UPDATE SET
                mtime_ns = excluded.mtime_ns,
                size = excluded.size,
                vocabulary = excluded.vocabulary,
                revision = excluded.revision,
                tags = excluded.tags
            """,
            (folder_key(folder), name, mtime_ns, size, vocabulary, next_revision(), payload),
        )
        conn.commit()


def forget_media_tags(folder: Path, names: Iterable[str]) -> int:
    """Drops rows for files that left the folder; a renamed file is tagged again under its new name."""
    key = folder_key(folder)
    with get_connection() as conn:
        removed = conn.executemany(
            "DELETE FROM media_tags WHERE folder = ? AND name = ?",
            [(key, name) for name in names],
        ).rowcount
        conn.commit()
    return removed


def queue_all_for_retag() -> int:
    """The old tags stay listed until the model replaces them, so no file goes blank meanwhile."""
    with get_connection() as conn:
        queued = conn.execute(
            "UPDATE media_tags SET vocabulary = ? WHERE vocabulary != ?",
            (RETAG_VOCABULARY, RETAG_VOCABULARY),
        ).rowcount
        conn.commit()
    return queued


def get_tag_min_confidence() -> float:
    return effective_settings().tag_min_confidence


def listed_tags(
    row: TagRow | None, mtime_ns: int, size: int, min_confidence: float
) -> list[dict[str, str | float]]:
    """Tags for the gallery: none once the file changed, and only those at the setting or above."""
    if row is None or not row.matches(mtime_ns, size):
        return []
    return [
        {"label": label, "confidence": score}
        for label, score in row.tags()
        if score >= min_confidence
    ]
