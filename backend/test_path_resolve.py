import os
import unittest
from pathlib import Path, PureWindowsPath
from unittest import mock

from path_resolve import remap_to_drive, resolve_path

SHARE = PureWindowsPath("\\\\server\\share")


class RemapToDriveTests(unittest.TestCase):
    def test_spells_a_network_target_under_its_drive_letter(self) -> None:
        self.assertEqual(
            remap_to_drive(SHARE / "Photos" / "Album", "z:", SHARE),
            PureWindowsPath("Z:\\Photos\\Album"),
        )

    def test_maps_the_target_itself_to_the_drive_root(self) -> None:
        self.assertEqual(remap_to_drive(SHARE, "Z:", SHARE), PureWindowsPath("Z:\\"))

    def test_spells_a_subst_target_under_its_drive_letter(self) -> None:
        target = PureWindowsPath("C:\\Data\\Mounted")
        self.assertEqual(
            remap_to_drive(PureWindowsPath("c:\\data\\mounted\\Photos"), "Q:", target),
            PureWindowsPath("Q:\\Photos"),
        )

    def test_leaves_a_path_outside_the_target_alone(self) -> None:
        # A link inside the drive that leads elsewhere must not be dressed up as on the drive.
        self.assertIsNone(remap_to_drive(PureWindowsPath("C:\\Elsewhere\\Photos"), "Z:", SHARE))


@unittest.skipUnless(os.name == "nt", "Windows drive letters only")
class ResolvePathTests(unittest.TestCase):
    def fake_resolve(self, mapping: dict[str, str]):
        real_resolve = Path.resolve

        def resolve(path: Path, strict: bool = False) -> Path:
            text = str(path)
            for drive, target in mapping.items():
                if text.upper().startswith(drive):
                    return Path(os.path.normpath(target + text[len(drive) :]))
            return real_resolve(path, strict)

        return mock.patch.object(Path, "resolve", autospec=True, side_effect=resolve)

    def test_keeps_a_mapped_drive_letter(self) -> None:
        with self.fake_resolve({"Z:\\": "\\\\server\\share\\"}):
            self.assertEqual(resolve_path(Path("Z:\\Photos\\..\\Album")), Path("Z:\\Album"))

    def test_keeps_a_subst_drive_root(self) -> None:
        with self.fake_resolve({"Q:\\": "C:\\Data\\Mounted\\"}):
            self.assertEqual(resolve_path(Path("q:\\")), Path("Q:\\"))

    def test_resolves_a_local_drive_as_before(self) -> None:
        here = Path.cwd()
        self.assertEqual(resolve_path(here / "sub" / ".."), here.resolve())


if __name__ == "__main__":
    unittest.main()
