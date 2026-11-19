from __future__ import annotations

import os
import shutil
import tempfile
import time
from collections.abc import Callable, Generator
from contextlib import contextmanager
from pathlib import Path

#: Antivirus and indexers briefly hold new names open on Windows.
LOCKED_RETRY_DELAYS = (0.05, 0.1, 0.2, 0.4, 0.8, 1.6)


def retry_while_locked(operation: Callable[[], object]) -> None:
    for delay in LOCKED_RETRY_DELAYS:
        try:
            operation()
            return
        except PermissionError:
            time.sleep(delay)
    operation()


@contextmanager
def _temporary_file(destination: Path) -> Generator[Path]:
    descriptor, name = tempfile.mkstemp(prefix=".write-", suffix=".tmp", dir=destination.parent)
    os.close(descriptor)
    temporary = Path(name)
    try:
        yield temporary
    finally:
        temporary.unlink(missing_ok=True)


def write_text_atomic(destination: Path, text: str) -> None:
    with _temporary_file(destination) as temporary:
        temporary.write_text(text, encoding="utf-8")
        os.replace(temporary, destination)


def write_bytes_atomic(destination: Path, data: bytes) -> None:
    with _temporary_file(destination) as temporary:
        temporary.write_bytes(data)
        os.replace(temporary, destination)


def publish_new_file(temporary: Path, destination: Path) -> bool:
    """Rename only while no file holds the name; on POSIX the temp survives as a link."""
    try:
        if os.name == "nt":
            os.rename(temporary, destination)
        else:
            os.link(temporary, destination)
    except FileExistsError:
        return False
    return True


def copy_file_atomic(source: Path, destination: Path, *, overwrite: bool = True) -> bool:
    if not overwrite and destination.exists():
        return False
    with _temporary_file(destination) as temporary:
        shutil.copy2(source, temporary)
        if overwrite:
            os.replace(temporary, destination)
        else:
            return publish_new_file(temporary, destination)
    return True
