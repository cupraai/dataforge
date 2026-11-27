"""New files named ``<prefix>_0001<ext>`` onwards, never replacing anything."""

from __future__ import annotations

import os
import re
import tempfile
from collections.abc import Generator
from contextlib import contextmanager, suppress
from pathlib import Path

from file_publish import unlink_quietly
from file_write import publish_new_file
from media_claims import ClaimActivity, MediaBusyError, claim

NUMBER_WIDTH = 4

_TEMP_PREFIX = ".generate-"
_TEMP_SUFFIX = ".tmp"


class NameConflict(Exception):
    """Every number tried was taken meanwhile."""


def _numbered_name(prefix: str) -> re.Pattern[str]:
    """``<prefix>_<digits>`` plus any extension, so sidecars count too."""
    return re.compile(rf"^{re.escape(prefix)}_(\d+)(?:\.|$)", re.IGNORECASE)


def next_number(folder: Path, prefix: str) -> int:
    """One past the highest number used, so a re-run continues the series."""
    pattern = _numbered_name(prefix)
    highest = 0
    with suppress(OSError):
        for entry in folder.iterdir():
            match = pattern.match(entry.name)
            if match:
                highest = max(highest, int(match.group(1)))
    return highest + 1


def numbered_stem(prefix: str, number: int) -> str:
    return f"{prefix}_{number:0{NUMBER_WIDTH}d}"


def name_is_free(folder: Path, prefix: str, number: int) -> bool:
    """A leftover caption would pair with new pixels."""
    stem = numbered_stem(prefix, number).lower()
    with suppress(OSError):
        for entry in folder.iterdir():
            if entry.name.lower() == stem or entry.name.lower().startswith(f"{stem}."):
                return False
    return True


@contextmanager
def temporary_file(folder: Path) -> Generator[Path]:
    """Beside its destination, so publishing it is a rename."""
    descriptor, name = tempfile.mkstemp(prefix=_TEMP_PREFIX, suffix=_TEMP_SUFFIX, dir=folder)
    os.close(descriptor)
    path = Path(name)
    try:
        yield path
    finally:
        unlink_quietly(path)


def sweep_temporary_files(folder: Path) -> None:
    """One job runs per folder, so none is in use when it starts."""
    with suppress(OSError):
        for leftover in folder.glob(f"{_TEMP_PREFIX}*{_TEMP_SUFFIX}"):
            with suppress(OSError):
                leftover.unlink()


def publish_numbered(
    temp_path: Path,
    folder: Path,
    prefix: str,
    suffix: str,
    first: int,
    activity: ClaimActivity,
) -> Path:
    """Moves ``temp_path`` to the first free number from ``first``."""
    number = first
    for _ in range(1000):
        if name_is_free(folder, prefix, number):
            destination = folder / f"{numbered_stem(prefix, number)}{suffix}"
            # A name another writer holds is as taken as one on disk.
            with suppress(MediaBusyError), claim([destination], activity):
                if publish_new_file(temp_path, destination):
                    return destination
        number += 1
    raise NameConflict(f'No free file name was found after "{numbered_stem(prefix, first)}".')


def number_of(path: Path) -> int:
    """The number a published file carries."""
    return int(path.stem.rsplit("_", 1)[1])
