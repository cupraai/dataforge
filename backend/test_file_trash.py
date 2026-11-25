from __future__ import annotations

import os
import stat
import struct
import sys
import time
import unittest
from pathlib import Path
from unittest.mock import ANY

from file_trash import (
    delete_empty_dir,
    delete_path,
    format_trashinfo,
    parse_recycle_record,
    parse_trashinfo,
    restore_from_trash,
    trash_available,
)
from testing_fixtures import TempMediaFolder, permanent_deletes, private_trash, write_media

ORIGINAL = "C:\\Data\\set\\sunset.png"
IS_LINUX = sys.platform.startswith("linux")


def _v1_record(path: str, deleted_at: int = 7) -> bytes:
    field = path.encode("utf-16-le").ljust(520, b"\0")
    return struct.pack("<qqq", 1, 1234, deleted_at) + field


def _v2_record(path: str, deleted_at: int = 7) -> bytes:
    encoded = (path + "\0").encode("utf-16-le")
    return struct.pack("<qqqi", 2, 1234, deleted_at, len(path) + 1) + encoded


class ParseRecycleRecordTests(unittest.TestCase):
    def test_reads_both_record_versions(self) -> None:
        for build in (_v1_record, _v2_record):
            with self.subTest(version=build.__name__):
                self.assertEqual(parse_recycle_record(build(ORIGINAL, 99)), (ORIGINAL, 99))

    def test_rejects_what_is_not_a_record(self) -> None:
        for data in (b"", b"short", struct.pack("<qqq", 3, 0, 0) + b"\0" * 8):
            with self.subTest(data=data):
                self.assertIsNone(parse_recycle_record(data))


class TrashInfoTests(unittest.TestCase):
    def test_round_trips_an_escaped_path(self) -> None:
        deleted_at = time.strptime("2026-03-04T05:06:07", "%Y-%m-%dT%H:%M:%S")
        text = format_trashinfo("/data/my set/100% café.png", deleted_at)

        self.assertIn("Path=/data/my%20set/100%25%20caf%C3%A9.png", text)
        self.assertIn("DeletionDate=2026-03-04T05:06:07", text)
        self.assertEqual(
            parse_trashinfo(text), ("/data/my set/100% café.png", "2026-03-04T05:06:07")
        )

    def test_reads_only_the_trash_info_group(self) -> None:
        text = (
            "# note\n[Trash Info]\nPath=a.png\nDeletionDate=2026-01-01T00:00:00\n[Other]\nPath=b\n"
        )

        self.assertEqual(parse_trashinfo(text), ("a.png", "2026-01-01T00:00:00"))

    def test_rejects_what_is_not_a_record(self) -> None:
        for text in ("", "Path=a.png", "[Trash Info]\nDeletionDate=2026-01-01T00:00:00"):
            with self.subTest(text=text):
                self.assertIsNone(parse_trashinfo(text))


class DisabledTrashTests(unittest.TestCase):
    def test_nothing_to_restore_where_deletes_are_permanent(self) -> None:
        with TempMediaFolder() as root, permanent_deletes():
            media = write_media(root, "sunset.png")

            self.assertFalse(trash_available(root))
            self.assertFalse(delete_path(media))
            self.assertFalse(media.exists())
            self.assertFalse(restore_from_trash(media))


class RecycleBinTests(unittest.TestCase):
    @unittest.skipUnless(sys.platform == "win32", "Recycle Bin is a Windows concern")
    def test_round_trips_through_the_recycle_bin(self) -> None:
        with TempMediaFolder() as root:
            media = write_media(root, "sunset.png")
            original = media.read_bytes()

            self.assertTrue(delete_path(media))
            self.assertFalse(media.exists())

            self.assertTrue(restore_from_trash(media))
            self.assertEqual(media.read_bytes(), original)
            # The record went with it, so a second undo finds nothing.
            media.unlink()
            self.assertFalse(restore_from_trash(media))

    @unittest.skipUnless(sys.platform == "win32", "Recycle Bin is a Windows concern")
    def test_never_restores_over_a_file_that_took_the_name(self) -> None:
        with TempMediaFolder() as root:
            media = write_media(root, "sunset.png")
            delete_path(media)
            write_media(root, "sunset.png")

            with self.assertRaises(FileExistsError):
                restore_from_trash(media)


@unittest.skipUnless(IS_LINUX, "the freedesktop trash is a Linux concern")
class FreedesktopTrashTests(unittest.TestCase):
    def setUp(self) -> None:
        self.trash = self.enterContext(private_trash())
        self.root = self.enterContext(TempMediaFolder())
        if os.stat(self.root).st_dev != os.stat(self.trash.parent).st_dev:
            self.skipTest("the temp folder is on another volume than the test's home trash")

    def test_round_trips_through_the_home_trash(self) -> None:
        media = write_media(self.root, "sunset.png")
        original = media.read_bytes()

        self.assertTrue(trash_available(self.root))
        self.assertTrue(delete_path(media))

        self.assertFalse(media.exists())
        self.assertEqual((self.trash / "files" / "sunset.png").read_bytes(), original)
        info = (self.trash / "info" / "sunset.png.trashinfo").read_text(encoding="utf-8")
        expected = str(Path(os.path.realpath(self.root)) / "sunset.png")
        self.assertEqual(parse_trashinfo(info), (expected, ANY))

        self.assertTrue(restore_from_trash(media))
        self.assertEqual(media.read_bytes(), original)
        self.assertEqual(list((self.trash / "info").iterdir()), [])
        media.unlink()
        self.assertFalse(restore_from_trash(media))

    def test_a_name_deleted_twice_keeps_both_and_restores_the_newest(self) -> None:
        media = write_media(self.root, "sunset.png")
        delete_path(media)
        first = self.trash / "info" / "sunset.png.trashinfo"
        expected = str(Path(os.path.realpath(self.root)) / "sunset.png")
        first.write_text(format_trashinfo(expected, time.localtime(0)), encoding="utf-8")
        media.write_bytes(b"newer")
        delete_path(media)

        names = sorted(path.name for path in (self.trash / "files").iterdir())
        self.assertEqual(names, ["sunset.2.png", "sunset.png"])

        self.assertTrue(restore_from_trash(media))
        self.assertEqual(media.read_bytes(), b"newer")

    def test_never_restores_over_a_file_that_took_the_name(self) -> None:
        media = write_media(self.root, "sunset.png")
        delete_path(media)
        write_media(self.root, "sunset.png")

        with self.assertRaises(FileExistsError):
            restore_from_trash(media)

    def test_an_empty_folder_goes_to_the_trash(self) -> None:
        folder = self.root / "empty"
        folder.mkdir()

        self.assertTrue(delete_empty_dir(folder))

        self.assertFalse(folder.exists())
        self.assertTrue((self.trash / "files" / "empty").is_dir())

    def test_the_trash_is_private_to_the_user(self) -> None:
        delete_path(write_media(self.root, "sunset.png"))

        for folder in (self.trash, self.trash / "files", self.trash / "info"):
            with self.subTest(folder=folder.name):
                self.assertEqual(stat.S_IMODE(os.stat(folder).st_mode), 0o700)


if __name__ == "__main__":
    unittest.main()
