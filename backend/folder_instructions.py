"""Per-folder instruction files: a folder without its own uses the nearest parent's."""

from __future__ import annotations

import os
from collections.abc import Callable
from pathlib import Path
from typing import Literal

from file_write import write_text_atomic
from schemas import InstructionFileResponse, InstructionFileState


def find_instruction_file(folder: Path, filename: str) -> Path | None:
    for directory in (folder, *folder.parents):
        candidate = directory / filename
        if candidate.is_file():
            return candidate
    return None


def instruction_file_reaches(folder: Path, job_folder: Path, filename: str) -> bool:
    """Whether writing ``folder``'s own file changes which one ``job_folder`` resolves to."""
    for directory in (job_folder, *job_folder.parents):
        if directory == folder:
            return True
        if (directory / filename).is_file():
            return False
    return False


def read_instruction_file(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig")


def describe_instruction_file(
    folder: Path,
    filename: str,
    locked_by_job_id: str | None,
    validate: Callable[[str], object] | None = None,
) -> InstructionFileResponse:
    """Keep source errors separate; the nearest file wins even when it cannot be used."""
    own = folder / filename
    has_file = own.is_file()
    parent = None if folder.parent == folder else find_instruction_file(folder.parent, filename)

    def describe(path: Path, origin: Literal["local", "inherited"]) -> InstructionFileState:
        state = InstructionFileState(
            origin=origin,
            status="ready",
            source_path=str(path),
            relative_path=os.path.relpath(path, folder),
            text="",
            message=None,
        )
        try:
            state.text = read_instruction_file(path)
        except (OSError, UnicodeError):
            state.status = "unreadable"
            state.message = "Could not read this file as UTF-8. Check its encoding and permissions."
            return state
        if not state.text.strip():
            state.status = "empty"
            state.message = "This file is empty and blocks instructions from folders above it."
        elif validate is not None:
            try:
                validate(state.text)
            except ValueError as exc:
                state.status = "invalid"
                state.message = str(exc)
        return state

    parent_state = None if parent is None else describe(parent, "inherited")
    local_state = describe(own, "local") if has_file else None
    state = (
        local_state
        or parent_state
        or InstructionFileState(
            origin="missing",
            status="missing",
            source_path=None,
            relative_path=None,
            text="",
            message=None,
        )
    )

    return InstructionFileResponse(
        text=local_state.text if local_state else "",
        has_file=has_file,
        parent_folder=None if parent is None else str(parent.parent),
        parent_relative_path=None if parent is None else os.path.relpath(parent, folder),
        parent_text=parent_state.text if parent_state else "",
        state=state,
        parent_state=parent_state,
        locked_by_job_id=locked_by_job_id,
    )


def save_instruction_file(folder: Path, filename: str, text: str) -> None:
    path = folder / filename

    if not text.strip():
        if path.is_file():
            path.unlink()
        return

    write_text_atomic(path, text.strip() + "\n")
