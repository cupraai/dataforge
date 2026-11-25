"""Move a finished temp file onto a name the gallery may still be streaming."""

from __future__ import annotations

import os
import sys
from collections.abc import Callable
from contextlib import suppress
from pathlib import Path

if sys.platform == "win32":
    import ctypes
    from ctypes import wintypes

    _FILE_WRITE_ATTRIBUTES = 0x0100
    _FILE_SHARE_ALL = 0x00000001 | 0x00000002 | 0x00000004
    _OPEN_EXISTING = 3
    _INVALID_HANDLE_VALUE = wintypes.HANDLE(-1).value
    #: 100 ns ticks from 1601-01-01 to the Unix epoch.
    _FILETIME_UNIX_EPOCH = 116_444_736_000_000_000

    _kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    _kernel32.CreateFileW.argtypes = [
        wintypes.LPCWSTR,
        wintypes.DWORD,
        wintypes.DWORD,
        wintypes.LPVOID,
        wintypes.DWORD,
        wintypes.DWORD,
        wintypes.HANDLE,
    ]
    _kernel32.CreateFileW.restype = wintypes.HANDLE
    _kernel32.SetFileTime.argtypes = [
        wintypes.HANDLE,
        ctypes.POINTER(wintypes.FILETIME),
        ctypes.POINTER(wintypes.FILETIME),
        ctypes.POINTER(wintypes.FILETIME),
    ]
    _kernel32.SetFileTime.restype = wintypes.BOOL
    _kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    _kernel32.CloseHandle.restype = wintypes.BOOL

    def _copy_creation_time(source: Path, target: Path) -> None:
        ticks = source.stat().st_birthtime_ns // 100 + _FILETIME_UNIX_EPOCH
        created = wintypes.FILETIME(ticks & 0xFFFFFFFF, ticks >> 32)
        handle = _kernel32.CreateFileW(
            os.fspath(target),
            _FILE_WRITE_ATTRIBUTES,
            _FILE_SHARE_ALL,
            None,
            _OPEN_EXISTING,
            0,
            None,
        )
        if handle == _INVALID_HANDLE_VALUE:
            raise ctypes.WinError(ctypes.get_last_error())
        try:
            if not _kernel32.SetFileTime(handle, ctypes.byref(created), None, None):
                raise ctypes.WinError(ctypes.get_last_error())
        finally:
            _kernel32.CloseHandle(handle)

elif sys.platform == "darwin":
    import ctypes

    _ATTR_BIT_MAP_COUNT = 5
    _ATTR_CMN_CRTIME = 0x00000200
    _FSOPT_NOFOLLOW = 0x00000001

    class _AttrList(ctypes.Structure):
        _fields_ = (
            ("bitmapcount", ctypes.c_uint16),
            ("reserved", ctypes.c_uint16),
            ("commonattr", ctypes.c_uint32),
            ("volattr", ctypes.c_uint32),
            ("dirattr", ctypes.c_uint32),
            ("fileattr", ctypes.c_uint32),
            ("forkattr", ctypes.c_uint32),
        )

    class _Timespec(ctypes.Structure):
        _fields_ = (("tv_sec", ctypes.c_long), ("tv_nsec", ctypes.c_long))

    _libc = ctypes.CDLL("libc.dylib", use_errno=True)
    _libc.setattrlist.argtypes = [
        ctypes.c_char_p,
        ctypes.POINTER(_AttrList),
        ctypes.c_void_p,
        ctypes.c_size_t,
        ctypes.c_uint,
    ]
    _libc.setattrlist.restype = ctypes.c_int

    def _copy_creation_time(source: Path, target: Path) -> None:
        # macOS reports creation only as a float.
        created_ns = round(source.stat().st_birthtime * 1_000_000_000)
        seconds, nanoseconds = divmod(created_ns, 1_000_000_000)
        created = _Timespec(tv_sec=seconds, tv_nsec=nanoseconds)
        attributes = _AttrList(bitmapcount=_ATTR_BIT_MAP_COUNT, commonattr=_ATTR_CMN_CRTIME)
        result = _libc.setattrlist(
            os.fsencode(target),
            ctypes.byref(attributes),
            ctypes.byref(created),
            ctypes.sizeof(created),
            _FSOPT_NOFOLLOW,
        )
        if result != 0:
            error = ctypes.get_errno()
            raise OSError(error, os.strerror(error), os.fspath(target))

else:

    def _copy_creation_time(source: Path, target: Path) -> None:
        """Linux has no call that sets a file's creation time."""


def copy_creation_time(source: Path, target: Path) -> None:
    """Only the creation time is written, so ``target``'s modified time and size stay as they are.

    A no-op on Linux.
    """
    _copy_creation_time(source, target)


def publish_replacing(temp_path: Path, final_path: Path, stale_path: Path) -> None:
    """Windows refuses ``os.replace`` onto a streamed path, so the destination moves aside first."""
    try:
        os.replace(temp_path, final_path)
        return
    except OSError:
        if not final_path.exists():
            raise

    with suppress(OSError):
        stale_path.unlink(missing_ok=True)

    os.replace(final_path, stale_path)
    try:
        os.replace(temp_path, final_path)
    except OSError:
        with suppress(OSError):
            os.replace(stale_path, final_path)
        raise

    with suppress(OSError):
        stale_path.unlink(missing_ok=True)


def sweep_publish_leftovers(
    folder: Path,
    *,
    temp_suffix: str,
    stale_suffix: str,
    is_busy: Callable[[Path], bool],
) -> None:
    """A stale file whose live file is gone is moved back, not deleted."""
    with suppress(OSError):
        for suffix in (temp_suffix, stale_suffix):
            for leftover in folder.glob(f"*{suffix}"):
                owner = leftover.with_name(leftover.name.removesuffix(suffix))
                if is_busy(owner):
                    continue
                with suppress(OSError):
                    if suffix == stale_suffix and not owner.exists():
                        os.replace(leftover, owner)
                    else:
                        leftover.unlink(missing_ok=True)
