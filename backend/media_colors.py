"""Each file's average colour, learned from its thumbnail and listed as the card's placeholder.

Rows are keyed by file name and only listed while the file's stat matches, like the tags.
"""

from __future__ import annotations

import logging
import sqlite3
import threading
from collections import OrderedDict
from collections.abc import Iterable
from pathlib import Path
from typing import NamedTuple

from PIL import Image, UnidentifiedImageError

from constants import AUDIO_EXTENSIONS
from db import get_connection
from media_tags import folder_key

logger = logging.getLogger(__name__)

#: Files whose colour this process already stored, so a scroll back costs no decode or write.
_MAX_REMEMBERED = 50_000

_remembered: OrderedDict[tuple[str, int, int], None] = OrderedDict()
_remembered_lock = threading.Lock()


class ColorRow(NamedTuple):
    mtime_ns: int
    size: int
    color: str


def init_media_colors_table() -> None:
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS media_colors (
                folder TEXT NOT NULL,
                name TEXT NOT NULL,
                mtime_ns INTEGER NOT NULL,
                size INTEGER NOT NULL,
                color TEXT NOT NULL,
                PRIMARY KEY (folder, name)
            )
            """
        )
        conn.commit()


def folder_color_rows(folder: Path) -> dict[str, ColorRow]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT name, mtime_ns, size, color FROM media_colors WHERE folder = ?",
            (folder_key(folder),),
        ).fetchall()
    return {row[0]: ColorRow(*row[1:]) for row in rows}


def forget_media_colors(folder: Path, names: Iterable[str]) -> None:
    key = folder_key(folder)
    with get_connection() as conn:
        conn.executemany(
            "DELETE FROM media_colors WHERE folder = ? AND name = ?",
            [(key, name) for name in names],
        )
        conn.commit()


def average_color(image_path: Path) -> str:
    """``#rrggbb``; raises ``OSError`` or ``UnidentifiedImageError`` for an unreadable image."""
    with Image.open(image_path) as image:
        red, green, blue = image.convert("RGB").resize((1, 1), Image.Resampling.BOX).tobytes()
    return f"#{red:02x}{green:02x}{blue:02x}"


def remember_thumbnail_color(source: Path, thumbnail: Path) -> None:
    """Best effort: a placeholder is never worth failing the thumbnail it rides on."""
    # An audio thumbnail is a drawn waveform, so its average says nothing about the file.
    if source.suffix.lower() in AUDIO_EXTENSIONS:
        return
    try:
        stat = source.stat()
        key = (str(source), stat.st_mtime_ns, stat.st_size)
        with _remembered_lock:
            if key in _remembered:
                _remembered.move_to_end(key)
                return

        color = average_color(thumbnail)
        with get_connection() as conn:
            conn.execute(
                """
                INSERT INTO media_colors (folder, name, mtime_ns, size, color)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(folder, name) DO UPDATE SET
                    mtime_ns = excluded.mtime_ns,
                    size = excluded.size,
                    color = excluded.color
                """,
                (folder_key(source.parent), source.name, stat.st_mtime_ns, stat.st_size, color),
            )
            conn.commit()
    except (OSError, sqlite3.Error, UnidentifiedImageError, ValueError):
        logger.debug("No placeholder colour for %s", source, exc_info=True)
        return

    with _remembered_lock:
        _remembered[key] = None
        while len(_remembered) > _MAX_REMEMBERED:
            _remembered.popitem(last=False)
