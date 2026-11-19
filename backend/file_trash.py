from __future__ import annotations

import os
import struct
import sys
from pathlib import Path

if sys.platform == "win32":
    import ctypes
    from ctypes import wintypes

    _FO_DELETE = 0x0003
    _FOF_SILENT = 0x0004
    _FOF_NOCONFIRMATION = 0x0010
    _FOF_ALLOWUNDO = 0x0040
    _FOF_NOERRORUI = 0x0400

    class _SHFILEOPSTRUCTW(ctypes.Structure):
        _fields_ = [
            ("hwnd", wintypes.HWND),
            ("wFunc", wintypes.UINT),
            ("pFrom", wintypes.LPCWSTR),
            ("pTo", wintypes.LPCWSTR),
            ("fFlags", wintypes.WORD),
            ("fAnyOperationsAborted", wintypes.BOOL),
            ("hNameMappings", wintypes.LPVOID),
            ("lpszProgressTitle", wintypes.LPCWSTR),
        ]

    _shell32 = ctypes.WinDLL("shell32", use_last_error=True)
    _shell32.SHFileOperationW.argtypes = [ctypes.POINTER(_SHFILEOPSTRUCTW)]
    _shell32.SHFileOperationW.restype = ctypes.c_int


def _send_to_recycle_bin(path: Path) -> None:
    # A trailing "\0" yields PCZZWSTR's double-null terminator.
    absolute = str(path.resolve(strict=False))
    from_buffer = ctypes.create_unicode_buffer(absolute + "\0")

    file_op = _SHFILEOPSTRUCTW()
    file_op.wFunc = _FO_DELETE
    file_op.pFrom = ctypes.cast(from_buffer, wintypes.LPCWSTR)
    file_op.fFlags = _FOF_ALLOWUNDO | _FOF_NOCONFIRMATION | _FOF_SILENT | _FOF_NOERRORUI

    result = _shell32.SHFileOperationW(ctypes.byref(file_op))
    if (result != 0 or file_op.fAnyOperationsAborted) and path.exists():
        raise OSError(
            f"Failed to move {path.name} to the Recycle Bin (error {result})",
        )


def delete_path(path: Path) -> None:
    """Recycle Bin on Windows, permanent unlink elsewhere."""
    if sys.platform == "win32":
        _send_to_recycle_bin(path)
        return
    path.unlink()


def delete_empty_dir(path: Path) -> None:
    """Elsewhere ``rmdir`` refuses a folder that gained an entry."""
    if sys.platform == "win32":
        _send_to_recycle_bin(path)
        return
    path.rmdir()


def deletes_to_trash() -> bool:
    return sys.platform == "win32"


# A `$I` record: version, size, deletion FILETIME, then the UTF-16 path (v1 fixed 260, v2 sized).
_RECYCLE_HEADER = struct.Struct("<qqq")
_RECYCLE_V1_PATH_CHARS = 260


def parse_recycle_record(data: bytes) -> tuple[str, int] | None:
    """``None`` if it is not a `$I` record."""
    if len(data) < _RECYCLE_HEADER.size:
        return None
    version, _size, deleted_at = _RECYCLE_HEADER.unpack_from(data)
    offset = _RECYCLE_HEADER.size
    if version == 1:
        raw = data[offset : offset + 2 * _RECYCLE_V1_PATH_CHARS]
    elif version == 2 and len(data) >= offset + 4:
        (chars,) = struct.unpack_from("<i", data, offset)
        raw = data[offset + 4 : offset + 4 + 2 * chars]
    else:
        return None
    path = raw.decode("utf-16-le", errors="replace").split("\0", 1)[0]
    return (path, deleted_at) if path else None


def _recycled_copies(original: Path) -> list[tuple[int, Path]]:
    """Every `$I` record for ``original``, as (deleted_at, record)."""
    root = Path(original.anchor) / "$Recycle.Bin"
    wanted = os.path.normcase(str(original))
    found: list[tuple[int, Path]] = []
    try:
        # Other users' folders refuse a listing.
        bins = [entry for entry in root.iterdir() if entry.is_dir()]
    except OSError:
        return found
    for bin_dir in bins:
        try:
            records = list(bin_dir.glob("$I*"))
        except OSError:
            continue
        for record in records:
            try:
                parsed = parse_recycle_record(record.read_bytes())
            except OSError:
                continue
            if parsed and os.path.normcase(parsed[0]) == wanted:
                found.append((parsed[1], record))
    return found


def restore_from_trash(original: Path) -> bool:
    """Restore the newest recycled copy; ``False`` if none, ``FileExistsError`` if taken."""
    if not deletes_to_trash():
        return False
    for _deleted_at, record in sorted(_recycled_copies(original), reverse=True):
        data = record.with_name("$R" + record.name[2:])
        if not data.exists():
            continue
        if original.exists():
            raise FileExistsError(f"{original.name} already exists")
        os.replace(data, original)
        record.unlink(missing_ok=True)
        return True
    return False
