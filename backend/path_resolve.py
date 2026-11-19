"""Resolve user paths without trading a mapped drive letter for its target."""

from __future__ import annotations

import os
from pathlib import Path, PureWindowsPath


def remap_to_drive(
    resolved: PureWindowsPath, drive: str, drive_target: PureWindowsPath
) -> PureWindowsPath | None:
    """``resolved`` spelled under ``drive``; None when it lies outside the drive's target."""
    try:
        relative = resolved.relative_to(drive_target)
    except ValueError:
        return None
    return PureWindowsPath(f"{drive.upper()}\\") / relative


def resolve_path(path: Path) -> Path:
    """Keeps the drive letter the path was given on."""
    resolved = path.resolve()
    if os.name != "nt":
        return resolved

    drive = PureWindowsPath(os.path.abspath(path)).drive
    if len(drive) != 2 or resolved.drive.upper() == drive.upper():
        return resolved

    # So a local drive is never asked twice.
    target = Path(f"{drive}\\").resolve()
    remapped = remap_to_drive(PureWindowsPath(resolved), drive, PureWindowsPath(target))
    return Path(remapped) if remapped is not None else resolved
