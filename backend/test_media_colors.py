from __future__ import annotations

import os
import unittest
from pathlib import Path
from urllib.parse import quote

from PIL import Image

from testing_fixtures import CacheFolderTestCase, TempMediaFolder, isolate_test_database

isolate_test_database()

from db import get_connection
from folder_scan import scan_folder
from media_colors import average_color, folder_color_rows, remember_thumbnail_color
from media_listing import list_media_from_scan
from media_tags import folder_key
from routes._test_client import client


def _solid(path: Path, color: tuple[int, int, int], size: tuple[int, int] = (40, 30)) -> Path:
    Image.new("RGB", size, color).save(path)
    return path


def _placeholders(folder: Path) -> dict[str, str | None]:
    return {
        item["name"]: item["placeholder_color"]
        for item in list_media_from_scan(scan_folder(folder))
    }


class MediaColorTests(CacheFolderTestCase):
    def test_averages_the_picture(self) -> None:
        with TempMediaFolder() as root:
            half = Image.new("RGB", (2, 1), (200, 0, 0))
            half.putpixel((1, 0), (0, 0, 100))
            half.save(root / "half.png")

            self.assertEqual(average_color(root / "half.png"), "#640032")

    def test_a_served_thumbnail_gives_the_listing_its_colour(self) -> None:
        with TempMediaFolder() as root:
            media = _solid(root / "red.png", (220, 20, 30))
            _solid(root / "plain.png", (0, 0, 0))
            self.assertEqual(_placeholders(root), {"plain.png": None, "red.png": None})

            response = client.get(f"/api/thumbnail?path={quote(str(media))}&w=180")

            self.assertEqual(response.status_code, 200)
            # WebP is lossy, so the colour is near, not exact.
            color = _placeholders(root)["red.png"]
            assert color is not None
            red, green, blue = (int(color[i : i + 2], 16) for i in (1, 3, 5))
            self.assertLess(abs(red - 220) + abs(green - 20) + abs(blue - 30), 12)
            self.assertIsNone(_placeholders(root)["plain.png"])

    def test_a_changed_file_lists_no_colour_until_served_again(self) -> None:
        with TempMediaFolder() as root:
            media = _solid(root / "photo.png", (10, 200, 10))
            remember_thumbnail_color(media, media)

            _solid(media, (10, 10, 200), size=(41, 30))
            stat = media.stat()
            os.utime(media, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1_000_000_000))

            self.assertEqual(_placeholders(root), {"photo.png": None})
            remember_thumbnail_color(media, media)
            self.assertEqual(_placeholders(root), {"photo.png": "#0a0ac8"})

    def test_listing_forgets_files_that_are_gone(self) -> None:
        with TempMediaFolder() as root:
            kept = _solid(root / "kept.png", (1, 2, 3))
            gone = _solid(root / "gone.png", (4, 5, 6))
            remember_thumbnail_color(kept, kept)
            remember_thumbnail_color(gone, gone)
            gone.unlink()

            self.assertEqual(_placeholders(root), {"kept.png": "#010203"})
            self.assertEqual(set(folder_color_rows(root)), {"kept.png"})

    def test_audio_gets_no_colour_from_its_waveform(self) -> None:
        with TempMediaFolder() as root:
            audio = root / "voice.mp3"
            audio.write_bytes(b"\x00" * 64)
            (root / "cache").mkdir()
            waveform = _solid(root / "cache" / "waveform.png", (90, 90, 90))

            remember_thumbnail_color(audio, waveform)
            self.assertEqual(folder_color_rows(root), {})

            # A row stored before audio was skipped still lists no colour.
            stat = audio.stat()
            with get_connection() as conn:
                conn.execute(
                    "INSERT INTO media_colors (folder, name, mtime_ns, size, color)"
                    " VALUES (?, ?, ?, ?, ?)",
                    (folder_key(root), audio.name, stat.st_mtime_ns, stat.st_size, "#5a5a5a"),
                )
                conn.commit()
            self.assertEqual(_placeholders(root), {"voice.mp3": None})

    def test_an_unreadable_thumbnail_is_skipped(self) -> None:
        with TempMediaFolder() as root:
            media = _solid(root / "photo.png", (1, 2, 3))
            broken = root / "broken.bin"
            broken.write_bytes(b"not an image")

            remember_thumbnail_color(media, broken)

            self.assertEqual(_placeholders(root), {"photo.png": None})


if __name__ == "__main__":
    unittest.main()
