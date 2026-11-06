"""Resolving a user's path without trading a mapped drive letter for what it points at.

``Path.resolve()`` follows ``subst`` and mapped network drives: ``Z:\\Photos`` comes back as
``\\\\server\\share\\Photos``. The app shows, keys and compares paths in the spelling the user
browsed, so every user path is resolved here and keeps its drive letter.
"""

from __future__ import annotations

import os
from pathlib import Path, PureWindowsPath


def remap_to_drive(
    resolved: PureWindowsPath, drive: str, drive_target: PureWindowsPath
) -> PureWindowsPath | None:
    """``resolved`` spelled under ``drive`` (``Z:``), given what that drive's root resolves to.

    None when ``resolved`` lies outside the drive's target, as after a link that leads elsewhere.
    """
    try:
        relative = resolved.relative_to(drive_target)
    except ValueError:
        return None
    return PureWindowsPath(f"{drive.upper()}\\") / relative


def resolve_path(path: Path) -> Path:
    """``path.resolve()``, keeping the drive letter the path was given on."""
    resolved = path.resolve()
    if os.name != "nt":
        return resolved

    drive = PureWindowsPath(os.path.abspath(path)).drive
    if len(drive) != 2 or resolved.drive.upper() == drive.upper():
        return resolved

    # Only a drive that resolves elsewhere gets here, so a local drive is never asked twice.
    target = Path(f"{drive}\\").resolve()
    remapped = remap_to_drive(PureWindowsPath(resolved), drive, PureWindowsPath(target))
    return Path(remapped) if remapped is not None else resolved
