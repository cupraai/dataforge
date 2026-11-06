import string
import unittest
from dataclasses import dataclass, field

from windows_drives import Drive, list_windows_drives

REMOVABLE = 2
FIXED = 3
NETWORK = 4
OPTICAL = 5
NO_ROOT_DIR = 1


@dataclass
class FakeDrive:
    drive_type: int
    #: ``None`` stands for a drive with no readable media.
    label: str | None = ""
    #: ``None`` stands for a disconnected network mapping.
    remote: str | None = None


@dataclass
class FakeDriveApi:
    drives: dict[str, FakeDrive]
    volume_reads: list[str] = field(default_factory=list)

    def logical_drives(self) -> int:
        return sum(1 << string.ascii_uppercase.index(letter) for letter in self.drives)

    def drive_type(self, root: str) -> int:
        return self.drives[root[0]].drive_type

    def volume_label(self, root: str) -> str | None:
        self.volume_reads.append(root)
        return self.drives[root[0]].label

    def network_remote(self, letter: str) -> str | None:
        return self.drives[letter].remote


class ListWindowsDrivesTests(unittest.TestCase):
    def test_lists_drives_in_letter_order_with_kind_and_label(self) -> None:
        api = FakeDriveApi(
            {
                "E": FakeDrive(REMOVABLE, "USB STICK"),
                "C": FakeDrive(FIXED, ""),
                "D": FakeDrive(FIXED, "Data"),
            }
        )

        self.assertEqual(
            list_windows_drives(api),
            [
                Drive("C", "fixed", None),
                Drive("D", "fixed", "Data"),
                Drive("E", "removable", "USB STICK"),
            ],
        )

    def test_skips_removable_and_optical_drives_without_media(self) -> None:
        api = FakeDriveApi(
            {
                "C": FakeDrive(FIXED),
                "F": FakeDrive(REMOVABLE, None),
                "G": FakeDrive(OPTICAL, None),
                "H": FakeDrive(OPTICAL, "MOVIE"),
            }
        )

        self.assertEqual(
            [drive.letter for drive in list_windows_drives(api)],
            ["C", "H"],
        )

    def test_keeps_a_fixed_drive_whose_volume_cannot_be_read(self) -> None:
        api = FakeDriveApi({"C": FakeDrive(FIXED, None)})

        self.assertEqual(list_windows_drives(api), [Drive("C", "fixed", None)])

    def test_labels_network_drives_by_share_without_reading_their_volume(self) -> None:
        api = FakeDriveApi(
            {
                "Y": FakeDrive(NETWORK, remote=None),
                "Z": FakeDrive(NETWORK, remote="\\\\server\\share"),
            }
        )

        self.assertEqual(list_windows_drives(api), [Drive("Z", "network", "\\\\server\\share")])
        self.assertEqual(api.volume_reads, [])

    def test_skips_letters_without_a_root_directory(self) -> None:
        api = FakeDriveApi({"C": FakeDrive(FIXED), "Q": FakeDrive(NO_ROOT_DIR)})

        self.assertEqual([drive.letter for drive in list_windows_drives(api)], ["C"])

    def test_drive_root_path(self) -> None:
        self.assertEqual(Drive("D", "fixed", None).root, "D:\\")


if __name__ == "__main__":
    unittest.main()
