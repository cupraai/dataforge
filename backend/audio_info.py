"""Audio length from a file's headers; nothing is decoded."""

from __future__ import annotations

import logging
from pathlib import Path

import mutagen
from mutagen import MutagenError

__all__ = ["adts_duration", "audio_duration", "is_adts"]

logger = logging.getLogger(__name__)

#: By the header's sampling frequency index.
ADTS_SAMPLE_RATES = (
    96000,
    88200,
    64000,
    48000,
    44100,
    32000,
    24000,
    22050,
    16000,
    12000,
    11025,
    8000,
    7350,
)
ADTS_HEADER_BYTES = 7
#: Per raw data block at the core rate, so HE-AAC's doubled output rate cancels out.
ADTS_SAMPLES_PER_BLOCK = 1024
ID3_HEADER_BYTES = 10


def _id3_end(data: bytes) -> int:
    if len(data) < ID3_HEADER_BYTES or data[:3] != b"ID3":
        return 0
    size = 0
    for byte in data[6:10]:
        size = size << 7 | byte & 0x7F
    footer = ID3_HEADER_BYTES if data[5] & 0x10 else 0
    return ID3_HEADER_BYTES + size + footer


def _is_adts_sync(data: bytes, offset: int = 0) -> bool:
    """A 12-bit sync word, then layer 0; MP3 frames never use layer 0."""
    return len(data) >= offset + 2 and data[offset] == 0xFF and data[offset + 1] & 0xF6 == 0xF0


def is_adts(path: Path) -> bool:
    """By content, since an edit's backup holds the stream under a ``.bak`` name."""
    with path.open("rb") as handle:
        handle.seek(_id3_end(handle.read(ID3_HEADER_BYTES)))
        return _is_adts_sync(handle.read(2))


def adts_duration(path: Path) -> float | None:
    """Counted frame by frame: ADTS stores no length, and a bitrate guess can be 20 times off."""
    data = path.read_bytes()
    offset = _id3_end(data)
    samples = 0
    rate = None
    while offset + ADTS_HEADER_BYTES <= len(data):
        # Anything else is a trailing tag.
        if not _is_adts_sync(data, offset):
            break
        index = data[offset + 2] >> 2 & 0x0F
        length = (data[offset + 3] & 0x03) << 11 | data[offset + 4] << 3 | data[offset + 5] >> 5
        if length < ADTS_HEADER_BYTES or index >= len(ADTS_SAMPLE_RATES):
            break
        rate = rate or ADTS_SAMPLE_RATES[index]
        samples += ADTS_SAMPLES_PER_BLOCK * ((data[offset + 6] & 0x03) + 1)
        offset += length
    if not samples or rate is None:
        return None
    return samples / rate


def audio_duration(path: Path) -> float | None:
    """Seconds, or ``None``; raises ``OSError`` when the file cannot be opened."""
    if is_adts(path):
        return adts_duration(path)
    with path.open("rb") as handle:
        try:
            audio = mutagen.File(handle)
        except MutagenError:
            logger.debug("No audio header for %s", path, exc_info=True)
            return None

    length = getattr(getattr(audio, "info", None), "length", None)
    if not isinstance(length, int | float) or length <= 0:
        return None
    return float(length)
