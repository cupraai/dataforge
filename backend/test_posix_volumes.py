from __future__ import annotations

import unittest
from types import SimpleNamespace

from posix_volumes import Volume, list_posix_volumes


def _partition(mountpoint: str, fstype: str = "ext4", device: str = "/dev/sdb1") -> SimpleNamespace:
    return SimpleNamespace(device=device, mountpoint=mountpoint, fstype=fstype)


def _linux(*partitions: SimpleNamespace, removable: frozenset[str] = frozenset()) -> list[Volume]:
    return list_posix_volumes(
        partitions, platform="linux", removable=lambda device: device in removable
    )


class LinuxVolumeTests(unittest.TestCase):
    def test_lists_volumes_mounted_where_desktops_attach_them(self) -> None:
        volumes = _linux(
            _partition("/", device="/dev/nvme0n1p2"),
            _partition("/boot/efi", "vfat", "/dev/nvme0n1p1"),
            _partition("/proc", "proc", "proc"),
            _partition("/media/user/Camera", "exfat", "/dev/sdb1"),
            _partition("/run/media/user/Backup", "ext4", "/dev/sdc1"),
            _partition("/mnt/data", "xfs", "/dev/sdd1"),
            removable=frozenset({"/dev/sdb1"}),
        )

        self.assertEqual(
            volumes,
            [
                Volume("/run/media/user/Backup", "fixed", "Backup"),
                Volume("/media/user/Camera", "removable", "Camera"),
                Volume("/mnt/data", "fixed", "data"),
            ],
        )

    def test_a_network_share_lists_wherever_it_is_mounted(self) -> None:
        volumes = _linux(
            _partition("/srv/nas", "nfs4", "nas:/export"),
            _partition("/home/user/share", "cifs", "//nas/share"),
            _partition("/run/user/1000/gvfs", "fuse.gvfsd-fuse", "gvfsd-fuse"),
        )

        self.assertEqual(
            volumes,
            [Volume("/srv/nas", "network", "nas"), Volume("/home/user/share", "network", "share")],
        )

    def test_decodes_the_mount_table_escapes_and_lists_each_mount_once(self) -> None:
        volumes = _linux(
            _partition("/media/user/My\\040Disk"),
            _partition("/media/user/My\\040Disk/"),
            _partition("/media/user/DVD", "iso9660", "/dev/sr0"),
        )

        self.assertEqual(
            volumes,
            [
                Volume("/media/user/DVD", "optical", "DVD"),
                Volume("/media/user/My Disk", "fixed", "My Disk"),
            ],
        )

    def test_leaves_out_the_parents_themselves(self) -> None:
        self.assertEqual(_linux(_partition("/media"), _partition("/mnt")), [])


class MacVolumeTests(unittest.TestCase):
    def test_lists_attached_volumes_but_not_the_system_ones(self) -> None:
        volumes = list_posix_volumes(
            [
                _partition("/", "apfs", "/dev/disk3s1s1"),
                _partition("/System/Volumes/Data", "apfs", "/dev/disk3s5"),
                _partition("/Volumes/Card", "msdos", "/dev/disk4s1"),
                _partition("/Volumes/share", "smbfs", "//user@nas/share"),
                _partition("/Volumes/.timemachine/abc", "apfs", "/dev/disk5s2"),
            ],
            platform="darwin",
        )

        self.assertEqual(
            volumes,
            [
                Volume("/Volumes/Card", "removable", "Card"),
                Volume("/Volumes/share", "network", "share"),
            ],
        )


if __name__ == "__main__":
    unittest.main()
