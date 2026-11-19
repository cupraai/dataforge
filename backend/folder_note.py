"""A parent's note never applies to a subfolder."""

from __future__ import annotations

import logging
from pathlib import Path

from constants import NOTE_FILENAME
from folder_instructions import read_instruction_file, save_instruction_file

logger = logging.getLogger(__name__)


def read_folder_note(path: Path) -> str:
    """Blank when unreadable, so a note never fails the listing."""
    try:
        return read_instruction_file(path).strip()
    except (OSError, UnicodeDecodeError):
        logger.warning("Could not read %s", path, exc_info=True)
        return ""


def save_folder_note(folder: Path, text: str) -> str:
    """Blank text deletes the file."""
    save_instruction_file(folder, NOTE_FILENAME, text)
    return text.strip()
