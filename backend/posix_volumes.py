"""Mounted volumes on Linux and macOS, read from the mount table so a dead share never blocks."""

from __future__ import annotations

import os
import re
import sys
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Literal, Protocol

import psutil

from constants import POSIX_VOLUME_PARENTS

type VolumeKind = Literal["fixed", "removable", "network", "optical"]

_NETWORK_FILESYSTEMS = frozenset(
    {
        "nfs",
        "nfs4",
        "cifs",
        "smb3",
        "smbfs",
        "afpfs",
        "webdav",
        "9p",
        "fuse.sshfs",
        "fuse.rclone",
        "davfs",
    }
)
_OPTICAL_FILESYSTEMS = frozenset({"iso9660", "udf", "cd9660"})
#: Where the system mounts its own views; a share mounted there is not a place to browse.
_SYSTEM_PREFIXES = ("/proc", "/sys", "/dev", "/run/user", "/snap", "/boot", "/System")
_OCTAL_ESCAPE = re.compile(r"\\([0-7]{3})")


class Partition(Protocol):
    device: str
    mountpoint: str
    fstype: str


@dataclass(frozen=True)
class Volume:
    path: str
    kind: VolumeKind
    label: str


def _unescape(mountpoint: str) -> str:
    """``/proc/mounts`` writes a space as ``\\040``."""
    return _OCTAL_ESCAPE.sub(lambda match: chr(int(match.group(1), 8)), mountpoint)


def _under(path: str, parent: str) -> bool:
    return path.startswith(parent.rstrip("/") + "/")


def _is_browsable(mountpoint: str, fstype: str, platform: str) -> bool:
    if any(mountpoint == prefix or _under(mountpoint, prefix) for prefix in _SYSTEM_PREFIXES):
        return False
    parents = POSIX_VOLUME_PARENTS["darwin" if platform == "darwin" else "linux"]
    if any(_under(mountpoint, parent) for parent in parents):
        return True
    return fstype in _NETWORK_FILESYSTEMS and mountpoint != "/"


def _linux_removable(device: str) -> bool:
    """The block device's flag, or its whole disk's for a partition."""
    name = os.path.basename(device)
    if not name:
        return False
    for flag in (f"/sys/class/block/{name}/removable", f"/sys/class/block/{name}/../removable"):
        try:
            with open(flag, encoding="ascii") as handle:
                return handle.read().strip() == "1"
        except OSError:
            continue
    return False


def _kind(partition: Partition, platform: str, removable: Callable[[str], bool]) -> VolumeKind:
    if partition.fstype in _NETWORK_FILESYSTEMS:
        return "network"
    if partition.fstype in _OPTICAL_FILESYSTEMS:
        return "optical"
    if platform == "darwin":
        # The boot volume never lists, so every volume here was attached.
        return "removable"
    return "removable" if removable(partition.device) else "fixed"


def list_posix_volumes(
    partitions: Iterable[Partition] | None = None,
    *,
    platform: str = sys.platform,
    removable: Callable[[str], bool] = _linux_removable,
) -> list[Volume]:
    """Never stats a mount point: an unreachable network share would block the listing."""
    if partitions is None:
        try:
            partitions = psutil.disk_partitions(all=True)
        except (OSError, RuntimeError):
            return []

    volumes: dict[str, Volume] = {}
    for partition in partitions:
        mountpoint = _unescape(partition.mountpoint).rstrip("/") or "/"
        label = os.path.basename(mountpoint)
        # Dot names are the system's own, such as Time Machine's local snapshots.
        if any(part.startswith(".") for part in mountpoint.split("/")) or mountpoint in volumes:
            continue
        if not _is_browsable(mountpoint, partition.fstype, platform):
            continue
        volumes[mountpoint] = Volume(
            path=mountpoint,
            kind=_kind(partition, platform, removable),
            label=label,
        )
    return sorted(volumes.values(), key=lambda volume: (volume.label.lower(), volume.path))
