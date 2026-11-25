import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from pathlib import Path, PureWindowsPath

from fastapi import HTTPException

from api_errors import folder_not_found
from constants import LAST_FOLDER_KEY
from db import get_preference
from file_trash import delete_empty_dir
from file_write import retry_while_locked
from folder_scan import scan_folder
from media_listing import summarize_folder_contents
from path_resolve import resolve_path
from posix_volumes import list_posix_volumes
from schemas import FolderRoot
from windows_drives import list_windows_drives

_INVALID_FOLDER_NAME_RE = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
_WINDOWS_DRIVE_ROOT = re.compile(r"^([A-Za-z]:)[\\/]*$")
_WINDOWS_ABS_PATH = re.compile(r"^[A-Za-z]:[\\/]")

_WINDOWS_RESERVED_NAMES = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}


def get_home_folder() -> Path:
    return Path.home().resolve()


def list_folder_roots() -> list[FolderRoot]:
    roots = [FolderRoot(name="Home", path=str(get_home_folder()), kind="home")]

    if os.name == "nt":
        roots.extend(
            FolderRoot(name=drive.root, path=drive.root, kind=drive.kind, label=drive.label)
            for drive in list_windows_drives()
        )
    else:
        roots.append(FolderRoot(name="/", path="/", kind="root"))
        roots.extend(
            FolderRoot(name=volume.label, path=volume.path, kind=volume.kind)
            for volume in list_posix_volumes()
        )

    return roots


def looks_like_windows_path(path: str) -> bool:
    """``C:\\...`` or ``C:/...``."""
    text = path.strip()
    if not text:
        return False
    if _WINDOWS_DRIVE_ROOT.fullmatch(text.replace("/", "\\")):
        return True
    return bool(_WINDOWS_ABS_PATH.match(text))


def normalize_user_path(path: str) -> Path:
    """POSIX never converts ``/`` to ``\\``."""
    text = path.strip()
    if not text:
        return Path.cwd().resolve()

    if os.name == "nt":
        text = text.replace("/", "\\")
        drive_root = re.fullmatch(r"([A-Za-z]:)(?:\\)?", text)
        if drive_root:
            return Path(f"{drive_root.group(1).upper()}\\")

    return resolve_path(Path(text).expanduser())


def path_leaf_name(path: str | Path) -> str:
    """``Path(r"C:\\a\\b").name`` is wrong on POSIX."""
    text = str(path).strip()
    if not text:
        return ""

    if looks_like_windows_path(text) or "\\" in text:
        name = PureWindowsPath(text).name
        if name:
            return name

    name = Path(text).name
    return name or text


def preference_folder_key(path: str) -> str:
    """Windows-style strings keep their shape so keys match on Linux."""
    text = path.strip()
    if not text:
        return text

    drive_root = _WINDOWS_DRIVE_ROOT.fullmatch(text.replace("/", "\\"))
    if drive_root:
        return f"{drive_root.group(1).upper()}\\"

    if os.name == "nt" or looks_like_windows_path(text):
        win = PureWindowsPath(text)
        if os.name == "nt":
            try:
                return str(resolve_path(Path(str(win)).expanduser()))
            except OSError:
                pass
        return str(win)

    try:
        return str(normalize_user_path(text))
    except OSError:
        return text.rstrip("/")


def folder_display_name(path: str | Path) -> str:
    if isinstance(path, Path):
        resolved = path
        if resolved.drive and resolved == Path(resolved.anchor):
            return resolved.drive
        return resolved.name or str(resolved)
    return path_leaf_name(path)


def resolve_folder(path: str) -> Path:
    folder = normalize_user_path(path)
    if not folder.exists():
        raise folder_not_found()
    if not folder.is_dir():
        raise HTTPException(status_code=400, detail="Path is not a directory")
    return resolve_path(folder)


def build_breadcrumbs(folder: Path) -> list[dict[str, str]]:
    folder = resolve_path(folder)
    chain: list[Path] = []
    current = folder
    while True:
        chain.append(current)
        parent = current.parent
        if parent == current:
            break
        current = parent
    chain.reverse()

    crumbs: list[dict[str, str]] = []
    for item in chain:
        crumbs.append({"name": folder_display_name(item), "path": str(item)})
    return crumbs


def _subfolder_with_stats(entry: Path) -> dict[str, str | int]:
    return {
        "name": entry.name,
        "path": str(entry),
        **summarize_folder_contents(entry),
    }


def _iter_child_directories(folder: Path) -> list[Path]:
    scan = scan_folder(folder)
    if scan is None:
        return []
    return [entry.path for entry in scan.dirs]


def list_child_folders(folder: Path) -> list[dict[str, str | bool]]:
    scan = scan_folder(folder)
    if scan is None:
        return []
    return [
        {"name": entry.name, "path": str(entry.path), "hidden": entry.hidden} for entry in scan.dirs
    ]


def sanitize_entry_name(name: str) -> str | None:
    """``name`` if a folder or file stem may carry it on every platform; else ``None``."""
    # Surrounding whitespace is refused rather than trimmed.
    if name != name.strip() or name in {"", ".", ".."} or name.endswith("."):
        return None

    if _INVALID_FOLDER_NAME_RE.search(name) or name.upper() in _WINDOWS_RESERVED_NAMES:
        return None

    return name


def create_subfolder(parent: Path, name: str) -> dict[str, str | int]:
    folder_name = sanitize_entry_name(name)
    if folder_name is None:
        raise HTTPException(status_code=400, detail="Invalid folder name")

    destination = parent / folder_name
    if destination.exists():
        raise HTTPException(status_code=409, detail="Folder already exists")

    try:
        destination.mkdir()
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to create folder: {exc}") from exc

    return _subfolder_with_stats(resolve_path(destination))


def _empty_folder_parent(folder: Path, action: str) -> Path:
    """The parent of an empty non-root ``folder``; hidden entries count."""
    parent = folder.parent
    if parent == folder:
        raise HTTPException(status_code=400, detail=f"Cannot {action} a drive root")

    try:
        with os.scandir(folder) as entries:
            names = sorted((entry.name for entry in entries), key=lambda name: (name.lower(), name))
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read folder: {exc}") from exc

    if names:
        extra = f" and {len(names) - 1} more" if len(names) > 1 else ""
        raise HTTPException(
            status_code=409,
            detail=f"Folder is not empty: contains {names[0]}{extra}",
        )

    return parent


def delete_empty_folder(folder: Path) -> tuple[Path, bool]:
    """Delete ``folder`` only if empty, hidden entries included.

    Returns the parent and whether the folder went to the trash.
    """
    parent = _empty_folder_parent(folder, "delete")

    try:
        recycled = delete_empty_dir(folder)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete folder: {exc}") from exc

    return parent, recycled


def rename_empty_folder(folder: Path, name: str) -> Path:
    """Rename ``folder`` only if empty, hidden entries included; returns the new path."""
    new_name = sanitize_entry_name(name)
    if new_name is None:
        raise HTTPException(status_code=400, detail="Invalid folder name")

    destination = _empty_folder_parent(folder, "rename") / new_name
    if new_name == folder.name:
        return folder
    # A change of case on a case-insensitive disk is no clash.
    if destination.exists() and not destination.samefile(folder):
        raise HTTPException(status_code=409, detail="Folder already exists")

    try:
        retry_while_locked(partial(folder.rename, destination))
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to rename folder: {exc}") from exc

    return destination


def list_subfolders(folder: Path) -> list[dict[str, str | int]]:
    subfolder_entries = _iter_child_directories(folder)
    if not subfolder_entries:
        return []

    max_workers = min(8, len(subfolder_entries))
    if max_workers <= 1:
        return [_subfolder_with_stats(entry) for entry in subfolder_entries]

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        return list(pool.map(_subfolder_with_stats, subfolder_entries))


class FolderExplorerError(Exception):
    """The OS file manager could not open the folder."""


class MediaPreviewError(Exception):
    """The OS viewer could not open the file."""


def _open_with_os_handler(
    target: Path,
    *,
    error: type[Exception],
    unavailable: str,
    failed: str,
) -> None:
    path = str(target)

    try:
        if sys.platform == "win32":
            os.startfile(path)
            return
        if sys.platform == "darwin":
            subprocess.run(["open", path], check=True)
            return
        subprocess.run(["xdg-open", path], check=True)
    except FileNotFoundError as exc:
        raise error(unavailable) from exc
    except OSError as exc:
        raise error(f"{failed}: {exc}") from exc


def open_folder_in_file_manager(folder: Path) -> None:
    _open_with_os_handler(
        folder,
        error=FolderExplorerError,
        unavailable="File manager is not available on this system",
        failed="Failed to open folder",
    )


def open_file_in_default_viewer(file_path: Path) -> None:
    _open_with_os_handler(
        file_path,
        error=MediaPreviewError,
        unavailable="Default viewer is not available on this system",
        failed="Failed to open file",
    )


def resolve_initial_folder(path: str | None) -> Path:
    if path:
        return resolve_folder(path)

    saved = get_preference(LAST_FOLDER_KEY)
    if saved:
        try:
            saved_path = normalize_user_path(saved)
        except OSError:
            saved_path = None
        if saved_path is not None and saved_path.is_dir():
            return resolve_path(saved_path)

    return get_home_folder()
