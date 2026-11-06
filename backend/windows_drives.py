"""Drive letters worth offering on Windows, found without blocking on a drive or prompting.

``Path("E:\\").exists()`` asks the drive itself: an empty card reader can raise a "no disk"
prompt and a disconnected network drive blocks for the SMB timeout. The drive type comes from
the mount table instead, so only a local drive is ever asked for its volume.
"""

from __future__ import annotations

import string
import sys
from dataclasses import dataclass
from functools import cache
from typing import Literal, Protocol

type DriveKind = Literal["fixed", "removable", "network", "optical", "ram"]

# GetDriveTypeW results; 0 (unknown) and 1 (no root directory) are never offered.
_DRIVE_KINDS: dict[int, DriveKind] = {
    2: "removable",
    3: "fixed",
    4: "network",
    5: "optical",
    6: "ram",
}

_SEM_FAILCRITICALERRORS = 0x0001
_SEM_NOOPENFILEERRORBOX = 0x8000
_NO_ERROR = 0
_MAX_PATH = 261


@dataclass(frozen=True)
class Drive:
    letter: str
    kind: DriveKind
    label: str | None

    @property
    def root(self) -> str:
        return f"{self.letter}:\\"


class DriveApi(Protocol):
    def logical_drives(self) -> int: ...

    def drive_type(self, root: str) -> int: ...

    def volume_label(self, root: str) -> str | None:
        """The volume's label, ``""`` for an unlabelled one, ``None`` with no readable media."""
        ...

    def network_remote(self, letter: str) -> str | None:
        """The share a mapped letter points at, ``None`` while it is disconnected."""
        ...


# Every Win32 function opens with its own platform guard rather than sharing one in a constructor:
# CI type-checks from Linux, where code after the guard is unreachable and is not checked.
_NEEDS_WINDOWS = "Drive letters need Windows"


@cache
def _kernel32():
    if sys.platform != "win32":
        raise OSError(_NEEDS_WINDOWS)

    import ctypes
    from ctypes import wintypes

    dword_p = ctypes.POINTER(wintypes.DWORD)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.GetLogicalDrives.restype = wintypes.DWORD
    kernel32.GetDriveTypeW.argtypes = [wintypes.LPCWSTR]
    kernel32.GetDriveTypeW.restype = wintypes.UINT
    kernel32.SetThreadErrorMode.argtypes = [wintypes.DWORD, dword_p]
    kernel32.SetThreadErrorMode.restype = wintypes.BOOL
    kernel32.GetVolumeInformationW.argtypes = [
        wintypes.LPCWSTR,
        wintypes.LPWSTR,
        wintypes.DWORD,
        dword_p,
        dword_p,
        dword_p,
        wintypes.LPWSTR,
        wintypes.DWORD,
    ]
    kernel32.GetVolumeInformationW.restype = wintypes.BOOL
    return kernel32


@cache
def _mpr():
    if sys.platform != "win32":
        raise OSError(_NEEDS_WINDOWS)

    import ctypes
    from ctypes import wintypes

    mpr = ctypes.WinDLL("mpr")
    mpr.WNetGetConnectionW.argtypes = [
        wintypes.LPCWSTR,
        wintypes.LPWSTR,
        ctypes.POINTER(wintypes.DWORD),
    ]
    mpr.WNetGetConnectionW.restype = wintypes.DWORD
    return mpr


class _Win32DriveApi:
    def logical_drives(self) -> int:
        if sys.platform != "win32":
            raise OSError(_NEEDS_WINDOWS)
        return int(_kernel32().GetLogicalDrives())

    def drive_type(self, root: str) -> int:
        if sys.platform != "win32":
            raise OSError(_NEEDS_WINDOWS)
        return int(_kernel32().GetDriveTypeW(root))

    def volume_label(self, root: str) -> str | None:
        if sys.platform != "win32":
            raise OSError(_NEEDS_WINDOWS)

        import ctypes
        from ctypes import wintypes

        kernel32 = _kernel32()
        buffer = ctypes.create_unicode_buffer(_MAX_PATH)
        previous = wintypes.DWORD()
        # An empty drive answers with an error code instead of a "no disk" prompt.
        kernel32.SetThreadErrorMode(
            _SEM_FAILCRITICALERRORS | _SEM_NOOPENFILEERRORBOX, ctypes.byref(previous)
        )
        try:
            ok = kernel32.GetVolumeInformationW(root, buffer, _MAX_PATH, None, None, None, None, 0)
        finally:
            kernel32.SetThreadErrorMode(previous.value, None)
        return buffer.value if ok else None

    def network_remote(self, letter: str) -> str | None:
        if sys.platform != "win32":
            raise OSError(_NEEDS_WINDOWS)

        import ctypes
        from ctypes import wintypes

        buffer = ctypes.create_unicode_buffer(_MAX_PATH)
        size = wintypes.DWORD(_MAX_PATH)
        status = _mpr().WNetGetConnectionW(f"{letter}:", buffer, ctypes.byref(size))
        return buffer.value if status == _NO_ERROR and buffer.value else None


def list_windows_drives(api: DriveApi | None = None) -> list[Drive]:
    """Drives that can be opened now: removable and optical ones only with media inserted,
    network ones only while connected (and never asked for their volume)."""
    api = api or _Win32DriveApi()
    mask = api.logical_drives()
    drives: list[Drive] = []

    for index, letter in enumerate(string.ascii_uppercase):
        if not mask & (1 << index):
            continue
        root = f"{letter}:\\"
        kind = _DRIVE_KINDS.get(api.drive_type(root))
        if kind is None:
            continue

        if kind == "network":
            remote = api.network_remote(letter)
            if remote is None:
                continue
            drives.append(Drive(letter, kind, remote))
            continue

        label = api.volume_label(root)
        if label is None and kind in ("removable", "optical"):
            continue
        drives.append(Drive(letter, kind, label or None))

    return drives
