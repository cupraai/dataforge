from __future__ import annotations

import unittest
from pathlib import Path

from audio_info import adts_duration, audio_duration, is_adts
from testing_fixtures import TempMediaFolder

#: Index 4 in the ADTS sampling frequency table.
RATE_44100 = 4


def adts_frame(*, rate_index: int = RATE_44100, payload: int = 16, blocks: int = 1) -> bytes:
    """One AAC-LC stereo frame header and a zero payload."""
    length = 7 + payload
    header = bytes(
        [
            0xFF,
            0xF1,
            0x40 | rate_index << 2,
            0x80 | length >> 11,
            length >> 3 & 0xFF,
            (length & 0x07) << 5 | 0x1F,
            0xFC | blocks - 1,
        ]
    )
    return header + bytes(payload)


def id3_tag(body: bytes) -> bytes:
    size = len(body)
    synchsafe = bytes([size >> 21 & 0x7F, size >> 14 & 0x7F, size >> 7 & 0x7F, size & 0x7F])
    return b"ID3\x03\x00\x00" + synchsafe + body


def write(root: Path, name: str, data: bytes) -> Path:
    path = root / name
    path.write_bytes(data)
    return path


class AdtsDurationTests(unittest.TestCase):
    def test_counts_every_frame_at_the_header_rate(self) -> None:
        with TempMediaFolder() as root:
            path = write(root, "song.aac", adts_frame() * 100)
            self.assertAlmostEqual(adts_duration(path) or 0, 100 * 1024 / 44100)

    def test_frames_of_different_sizes_count_alike(self) -> None:
        """Variable bitrate is why the bitrate guess fails; frame sizes must not matter."""
        with TempMediaFolder() as root:
            frames = adts_frame(payload=8) * 50 + adts_frame(payload=900) * 50
            path = write(root, "song.aac", frames)
            self.assertAlmostEqual(adts_duration(path) or 0, 100 * 1024 / 44100)

    def test_a_frame_with_several_raw_blocks_counts_each(self) -> None:
        with TempMediaFolder() as root:
            path = write(root, "song.aac", adts_frame(blocks=4) * 10)
            self.assertAlmostEqual(adts_duration(path) or 0, 40 * 1024 / 44100)

    def test_tags_before_and_after_the_frames_are_skipped(self) -> None:
        with TempMediaFolder() as root:
            tagged = id3_tag(b"TIT2" + bytes(40)) + adts_frame() * 20 + b"TAG" + bytes(125)
            path = write(root, "song.aac", tagged)
            self.assertAlmostEqual(adts_duration(path) or 0, 20 * 1024 / 44100)

    def test_a_file_without_frames_has_no_length(self) -> None:
        with TempMediaFolder() as root:
            self.assertIsNone(adts_duration(write(root, "broken.aac", b"not aac")))
            self.assertIsNone(adts_duration(write(root, "empty.aac", b"")))

    def test_audio_duration_counts_frames_whatever_the_name(self) -> None:
        """An edit's backup is ``song.aac.bak``."""
        with TempMediaFolder() as root:
            for name in ("SONG.AAC", "song.aac.bak"):
                with self.subTest(name=name):
                    path = write(root, name, adts_frame(rate_index=3) * 30)
                    self.assertAlmostEqual(audio_duration(path) or 0, 30 * 1024 / 48000)

    def test_an_mp3_frame_is_not_adts(self) -> None:
        with TempMediaFolder() as root:
            mp3 = write(root, "song.mp3", id3_tag(bytes(20)) + b"\xff\xfb\x90\x00" + bytes(400))
            self.assertFalse(is_adts(mp3))
            self.assertTrue(is_adts(write(root, "song.aac", id3_tag(bytes(20)) + adts_frame())))


if __name__ == "__main__":
    unittest.main()
