"""Drive letters worth offering on Windows, found without blocking on a drive or prompting.

``Path("E:\\").exists()`` asks the drive itself: an empty card reader can raise a "no disk"
prompt and a disconnected network drive blocks for the SMB timeout. The drive type comes from
the mount table instead, so only a local drive is ever asked for its volume.
"""

from __future__ import annotations

import string
import sys
from dataclasses import dataclass
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


class _Win32DriveApi:
    def __init__(self) -> None:
        # Guarded rather than dispatched on: CI type-checks this file from Linux.
        if sys.platform != "win32":
            raise OSError("Drive letters need Windows")

        import ctypes
        from ctypes import wintypes

        self._ctypes = ctypes
        self._wintypes = wintypes
        self._kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        self._mpr = ctypes.WinDLL("mpr")

        self._kernel32.GetLogicalDrives.restype = wintypes.DWORD
        self._kernel32.GetDriveTypeW.argtypes = [wintypes.LPCWSTR]
        self._kernel32.GetDriveTypeW.restype = wintypes.UINT
        self._kernel32.SetThreadErrorMode.argtypes = [
            wintypes.DWORD,
            ctypes.POINTER(wintypes.DWORD),
        ]
        self._kernel32.SetThreadErrorMode.restype = wintypes.BOOL
        self._kernel32.GetVolumeInformationW.argtypes = [
            wintypes.LPCWSTR,
            wintypes.LPWSTR,
            wintypes.DWORD,
            ctypes.POINTER(wintypes.DWORD),
            ctypes.POINTER(wintypes.DWORD),
            ctypes.POINTER(wintypes.DWORD),
            wintypes.LPWSTR,
            wintypes.DWORD,
        ]
        self._kernel32.GetVolumeInformationW.restype = wintypes.BOOL
        self._mpr.WNetGetConnectionW.argtypes = [
            wintypes.LPCWSTR,
            wintypes.LPWSTR,
            ctypes.POINTER(wintypes.DWORD),
        ]
        self._mpr.WNetGetConnectionW.restype = wintypes.DWORD

    def logical_drives(self) -> int:
        return int(self._kernel32.GetLogicalDrives())

    def drive_type(self, root: str) -> int:
        return int(self._kernel32.GetDriveTypeW(root))

    def volume_label(self, root: str) -> str | None:
        buffer = self._ctypes.create_unicode_buffer(_MAX_PATH)
        previous = self._wintypes.DWORD()
        # An empty drive answers with an error code instead of a "no disk" prompt.
        self._kernel32.SetThreadErrorMode(
            _SEM_FAILCRITICALERRORS | _SEM_NOOPENFILEERRORBOX, self._ctypes.byref(previous)
        )
        try:
            ok = self._kernel32.GetVolumeInformationW(
                root, buffer, _MAX_PATH, None, None, None, None, 0
            )
        finally:
            self._kernel32.SetThreadErrorMode(previous.value, None)
        return buffer.value if ok else None

    def network_remote(self, letter: str) -> str | None:
        buffer = self._ctypes.create_unicode_buffer(_MAX_PATH)
        size = self._wintypes.DWORD(_MAX_PATH)
        status = self._mpr.WNetGetConnectionW(f"{letter}:", buffer, self._ctypes.byref(size))
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
