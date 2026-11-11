"""Every reader sees an EXIF-rotated photo the way the browser and the editor show it."""

from __future__ import annotations

from testing_fixtures import isolate_test_database

isolate_test_database()

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image, PngImagePlugin

from automation.vision import load_image_rgb
from media_dimensions import media_dimensions
from testing_fixtures import TempMediaFolder, write_jpeg
from thumbnails import get_or_create_thumbnail
from video_frames import media_first_frame

# Stored 32 x 16; Orientation 6 means "rotate 90 degrees clockwise to display", so 16 x 32.
STORED = (32, 16)
DISPLAYED = (16, 32)


def _rotated_photo(root: Path) -> Path:
    return write_jpeg(root, "portrait.jpg", width=STORED[0], height=STORED[1], orientation=6)


class ExifOrientationReaderTests(unittest.TestCase):
    def test_the_vision_loader_sends_the_displayed_frame(self) -> None:
        with TempMediaFolder() as root:
            images, error = load_image_rgb(_rotated_photo(root))

        self.assertIsNone(error)
        assert images is not None
        self.assertEqual(images[0].size, DISPLAYED)

    def test_the_first_frame_of_a_still_is_the_displayed_frame(self) -> None:
        with TempMediaFolder() as root:
            frame = media_first_frame(_rotated_photo(root))

        assert frame is not None
        self.assertEqual(frame.size, DISPLAYED)

    def test_listing_dimensions_are_the_displayed_size(self) -> None:
        with TempMediaFolder() as root:
            media = _rotated_photo(root)
            stat = media.stat()

            self.assertEqual(
                media_dimensions(media, "image", stat.st_mtime_ns, stat.st_size), DISPLAYED
            )

    def test_a_turned_tiff_lists_the_size_its_thumbnail_has(self) -> None:
        """Pillow's TIFF reader turns the size itself, so turning it again would undo it."""
        with TempMediaFolder() as root:
            media = root / "scan.tiff"
            # 274 is Orientation.
            Image.new("RGB", STORED).save(
                media, format="TIFF", tiffinfo={274: 6}, compression="tiff_lzw"
            )
            stat = media.stat()

            self.assertEqual(
                media_dimensions(media, "image", stat.st_mtime_ns, stat.st_size), DISPLAYED
            )
            with Image.open(get_or_create_thumbnail(media, 1200)) as thumbnail:
                self.assertEqual(thumbnail.size, DISPLAYED)

    def test_an_unrotated_photo_keeps_its_stored_size(self) -> None:
        with TempMediaFolder() as root:
            media = write_jpeg(root, "landscape.jpg", width=STORED[0], height=STORED[1])
            stat = media.stat()

            self.assertEqual(
                media_dimensions(media, "image", stat.st_mtime_ns, stat.st_size), STORED
            )

    def test_png_listing_dimensions_are_read_without_decoding_pixels(self) -> None:
        exif = Image.Exif()
        exif[0x0112] = 6
        with TempMediaFolder() as root:
            rotated = root / "rotated.png"
            Image.new("RGB", STORED).save(rotated, exif=exif)
            plain = root / "plain.png"
            Image.new("RGB", STORED).save(plain)

            with patch.object(
                PngImagePlugin.PngImageFile, "load", side_effect=AssertionError("decoded")
            ):
                sizes = [
                    media_dimensions(path, "image", path.stat().st_mtime_ns, path.stat().st_size)
                    for path in (rotated, plain)
                ]

        self.assertEqual(sizes, [DISPLAYED, STORED])

    def test_the_thumbnail_is_the_displayed_frame(self) -> None:
        with TempMediaFolder() as root, tempfile.TemporaryDirectory() as cache:
            media = _rotated_photo(root)
            with patch.dict(os.environ, {"DATAFORGE_THUMBNAIL_CACHE": cache}):
                thumbnail = get_or_create_thumbnail(media, 256)

                with Image.open(thumbnail) as opened:
                    self.assertEqual(opened.size, DISPLAYED)


if __name__ == "__main__":
    unittest.main()
