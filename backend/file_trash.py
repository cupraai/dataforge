"""Deletes go to the platform's trash where it has one, so the gallery can undo them."""

from __future__ import annotations

import os
import stat
import struct
import sys
import threading
import time
from collections import OrderedDict
from pathlib import Path
from urllib.parse import quote, unquote

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


#: Set by tests that delete, so they never fill the real trash.
TRASH_DISABLED_ENV = "DATAFORGE_DISABLE_TRASH"


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


if sys.platform == "darwin":
    import ctypes
    import ctypes.util

    _objc = ctypes.CDLL(ctypes.util.find_library("objc"))
    # Loading Foundation registers NSFileManager and friends with the runtime.
    ctypes.CDLL("/System/Library/Frameworks/Foundation.framework/Foundation")
    _objc.objc_getClass.argtypes = [ctypes.c_char_p]
    _objc.objc_getClass.restype = ctypes.c_void_p
    _objc.sel_registerName.argtypes = [ctypes.c_char_p]
    _objc.sel_registerName.restype = ctypes.c_void_p
    _objc.objc_autoreleasePoolPush.restype = ctypes.c_void_p
    _objc.objc_autoreleasePoolPop.argtypes = [ctypes.c_void_p]

    def _send(receiver: object, selector: bytes, restype: object, *args: tuple[object, object]):
        # arm64 needs objc_msgSend called with the exact prototype, never as a variadic.
        prototype = ctypes.CFUNCTYPE(
            restype, ctypes.c_void_p, ctypes.c_void_p, *(kind for kind, _ in args)
        )
        function = ctypes.cast(_objc.objc_msgSend, prototype)
        return function(receiver, _objc.sel_registerName(selector), *(value for _, value in args))

    def _utf8(string: object) -> str:
        raw = _send(string, b"UTF8String", ctypes.c_char_p) if string else None
        return os.fsdecode(raw) if raw else ""

    def _send_to_macos_trash(path: Path) -> Path:
        """NSFileManager files it as Finder would, so Put Back works; returns where it went."""
        pool = _objc.objc_autoreleasePoolPush()
        try:
            text = _send(
                _objc.objc_getClass(b"NSString"),
                b"stringWithUTF8String:",
                ctypes.c_void_p,
                (ctypes.c_char_p, os.fsencode(path)),
            )
            url = _send(
                _objc.objc_getClass(b"NSURL"),
                b"fileURLWithPath:",
                ctypes.c_void_p,
                (ctypes.c_void_p, text),
            )
            manager = _send(
                _objc.objc_getClass(b"NSFileManager"), b"defaultManager", ctypes.c_void_p
            )
            result = ctypes.c_void_p()
            error = ctypes.c_void_p()
            moved = _send(
                manager,
                b"trashItemAtURL:resultingItemURL:error:",
                ctypes.c_bool,
                (ctypes.c_void_p, url),
                (ctypes.POINTER(ctypes.c_void_p), ctypes.byref(result)),
                (ctypes.POINTER(ctypes.c_void_p), ctypes.byref(error)),
            )
            if not moved or not result.value:
                detail = ""
                if error.value:
                    described = _send(error, b"localizedDescription", ctypes.c_void_p)
                    detail = _utf8(described)
                raise OSError(
                    f"Failed to move {path.name} to the Trash: {detail or 'unknown error'}"
                )
            return Path(_utf8(_send(result, b"path", ctypes.c_void_p)))
        finally:
            _objc.objc_autoreleasePoolPop(pool)


#: macOS has no public lookup from an original path to its trashed copy. Undo only lives as long
#: as its notice, so a bounded map in memory is enough; after a restart restore finds nothing.
_MACOS_TRASHED_LIMIT = 1000
_macos_trashed: OrderedDict[str, list[Path]] = OrderedDict()
_macos_trashed_lock = threading.Lock()


def _remember_macos_trashed(original: Path, trashed: Path) -> None:
    key = os.path.normcase(str(original))
    with _macos_trashed_lock:
        _macos_trashed.setdefault(key, []).append(trashed)
        _macos_trashed.move_to_end(key)
        while len(_macos_trashed) > _MACOS_TRASHED_LIMIT:
            _macos_trashed.popitem(last=False)


def _restore_macos(original: Path) -> bool:
    key = os.path.normcase(str(original))
    with _macos_trashed_lock:
        copies = _macos_trashed.get(key, [])
        while copies:
            trashed = copies[-1]
            if not os.path.lexists(trashed):
                copies.pop()
                continue
            if os.path.lexists(original):
                raise FileExistsError(f"{original.name} already exists")
            os.rename(trashed, original)
            copies.pop()
            if not copies:
                _macos_trashed.pop(key, None)
            return True
        _macos_trashed.pop(key, None)
    return False


# freedesktop.org Trash spec 1.0: one trash in the home folder and one per mounted volume.
_TRASHINFO_HEADER = "[Trash Info]"
_TRASHINFO_SUFFIX = ".trashinfo"
_DELETION_DATE_FORMAT = "%Y-%m-%dT%H:%M:%S"


def format_trashinfo(original: str, deleted_at: time.struct_time) -> str:
    """``original`` is absolute for the home trash, relative to the volume for a volume trash."""
    deleted = time.strftime(_DELETION_DATE_FORMAT, deleted_at)
    return f"{_TRASHINFO_HEADER}\nPath={quote(original, safe='/')}\nDeletionDate={deleted}\n"


def parse_trashinfo(text: str) -> tuple[str, str] | None:
    """``(path, deletion date)``; the date sorts as text. ``None`` if it is not a record."""
    lines = [line.strip() for line in text.splitlines()]
    if _TRASHINFO_HEADER not in lines:
        return None
    fields: dict[str, str] = {}
    for line in lines[lines.index(_TRASHINFO_HEADER) + 1 :]:
        if line.startswith("["):
            break
        key, separator, value = line.partition("=")
        if separator:
            fields.setdefault(key.strip(), value.strip())
    path = fields.get("Path")
    return (unquote(path), fields.get("DeletionDate", "")) if path else None


def _uid() -> int:
    if sys.platform == "win32":
        raise OSError("A trash per user id needs a POSIX system")
    return os.getuid()


def _home_trash() -> Path:
    data_home = os.environ.get("XDG_DATA_HOME") or os.path.join(Path.home(), ".local", "share")
    return Path(data_home) / "Trash"


def _device(path: Path) -> int | None:
    """Of ``path``, or of its nearest existing parent: the home trash may not exist yet."""
    for candidate in (path, *path.parents):
        try:
            return os.stat(candidate).st_dev
        except OSError:
            continue
    return None


def _mount_top(path: Path) -> Path:
    current = path
    while not os.path.ismount(current) and current.parent != current:
        current = current.parent
    return current


def _real_location(path: Path) -> Path:
    """The parent is resolved so the volume is found; the entry itself may be a link."""
    return Path(os.path.realpath(path.parent)) / path.name


def _usable_trash(trash: Path, *, create: bool) -> bool:
    if create:
        try:
            trash.mkdir(mode=0o700, parents=True, exist_ok=True)
            (trash / "files").mkdir(mode=0o700, exist_ok=True)
            (trash / "info").mkdir(mode=0o700, exist_ok=True)
        except OSError:
            return False
    try:
        info = os.stat(trash)
    except OSError:
        return False
    return stat.S_ISDIR(info.st_mode) and info.st_uid == _uid()


def _linux_trash(directory: Path, *, create: bool) -> tuple[Path, Path | None] | None:
    """The trash for entries of ``directory`` and its volume top (``None`` for the home trash).

    ``None`` when there is none. Without ``create``, a trash that could still be made counts.
    """
    device = _device(directory)
    home_trash = _home_trash()
    if device is not None and device == _device(home_trash):
        if create and not _usable_trash(home_trash, create=True):
            return None
        return home_trash, None

    top = _mount_top(directory)
    uid = _uid()
    shared = top / ".Trash"
    try:
        shared_info = os.lstat(shared)
        # The spec trusts an admin-made .Trash only as a real, sticky folder.
        if stat.S_ISDIR(shared_info.st_mode) and shared_info.st_mode & stat.S_ISVTX:
            own = shared / str(uid)
            if _usable_trash(own, create=create):
                return own, top
    except OSError:
        pass

    own = top / f".Trash-{uid}"
    if _usable_trash(own, create=create):
        return own, top
    if not create and not os.path.lexists(own) and os.access(top, os.W_OK):
        return own, top
    return None


def _reserve_trash_name(trash: Path, name: str, record: str) -> str:
    stem, dot, suffix = name.partition(".") if not name.startswith(".") else (name, "", "")
    for attempt in range(1, 10_000):
        candidate = name if attempt == 1 else f"{stem}.{attempt}{dot}{suffix}"
        if os.path.lexists(trash / "files" / candidate):
            continue
        try:
            fd = os.open(
                trash / "info" / f"{candidate}{_TRASHINFO_SUFFIX}",
                os.O_WRONLY | os.O_CREAT | os.O_EXCL,
                0o600,
            )
        except FileExistsError:
            continue
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(record)
        return candidate
    raise OSError(f"No free name in the Trash for {name}")


def _send_to_linux_trash(path: Path) -> bool:
    """``False`` where the volume has no trash, so the caller deletes for good."""
    location = _real_location(path)
    found = _linux_trash(location.parent, create=True)
    if found is None:
        return False
    trash, top = found
    original = str(location) if top is None else os.path.relpath(location, top)
    name = _reserve_trash_name(trash, path.name, format_trashinfo(original, time.localtime()))
    info = trash / "info" / f"{name}{_TRASHINFO_SUFFIX}"
    try:
        os.rename(path, trash / "files" / name)
    except OSError:
        info.unlink(missing_ok=True)
        raise
    return True


def _restore_linux(original: Path) -> bool:
    location = _real_location(original)
    found = _linux_trash(location.parent, create=False)
    if found is None:
        return False
    trash, top = found
    wanted = str(location) if top is None else os.path.relpath(location, top)
    stem = original.name.split(".", 1)[0] if not original.name.startswith(".") else original.name
    copies: list[tuple[str, str]] = []
    try:
        with os.scandir(trash / "info") as entries:
            for entry in entries:
                if not entry.name.endswith(_TRASHINFO_SUFFIX) or not entry.name.startswith(stem):
                    continue
                try:
                    with open(entry.path, encoding="utf-8") as handle:
                        parsed = parse_trashinfo(handle.read())
                except (OSError, UnicodeDecodeError):
                    continue
                if parsed and parsed[0] == wanted:
                    copies.append((parsed[1], entry.name.removesuffix(_TRASHINFO_SUFFIX)))
    except OSError:
        return False

    for _deleted_at, name in sorted(copies, reverse=True):
        data = trash / "files" / name
        if not os.path.lexists(data):
            continue
        if os.path.lexists(original):
            raise FileExistsError(f"{original.name} already exists")
        os.rename(data, original)
        (trash / "info" / f"{name}{_TRASHINFO_SUFFIX}").unlink(missing_ok=True)
        return True
    return False


def _trash_disabled() -> bool:
    return bool(os.environ.get(TRASH_DISABLED_ENV))


def _send_to_trash(path: Path) -> bool:
    """``False`` where nothing took it, so the caller deletes it for good."""
    if _trash_disabled():
        return False
    if sys.platform == "win32":
        _send_to_recycle_bin(path)
        return True
    if sys.platform == "darwin":
        _remember_macos_trashed(path, _send_to_macos_trash(path))
        return True
    if sys.platform.startswith("linux"):
        return _send_to_linux_trash(path)
    return False


def delete_path(path: Path) -> bool:
    """``True`` when it went to the trash; ``False`` when it was deleted for good."""
    if _send_to_trash(path):
        return True
    path.unlink()
    return False


def delete_empty_dir(path: Path) -> bool:
    """Like ``delete_path``; without a trash, ``rmdir`` refuses a folder that gained an entry."""
    if _send_to_trash(path):
        return True
    path.rmdir()
    return False


def trash_available(folder: Path) -> bool:
    """Whether deleting in ``folder`` can be undone."""
    if _trash_disabled():
        return False
    if sys.platform in ("win32", "darwin"):
        return True
    if sys.platform.startswith("linux"):
        try:
            return _linux_trash(Path(os.path.realpath(folder)), create=False) is not None
        except OSError:
            return False
    return False


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
    """Restore the newest trashed copy; ``False`` if none, ``FileExistsError`` if taken."""
    if _trash_disabled():
        return False
    if sys.platform == "darwin":
        return _restore_macos(original)
    if sys.platform.startswith("linux"):
        return _restore_linux(original)
    if sys.platform != "win32":
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
