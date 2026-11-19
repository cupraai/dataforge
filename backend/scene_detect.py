"""Hard cuts: a score far above its neighbours', so a fast pan does not read as cuts."""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass

import cv2
import numpy as np

from schemas import SceneSensitivity

#: Colors and layout survive; noise and grain do not.
ANALYSIS_WIDTH = 64
ANALYSIS_HEIGHT = 36
ANALYSIS_FRAME_BYTES = ANALYSIS_WIDTH * ANALYSIS_HEIGHT * 3

#: The neighbors a cut must stand above.
NEIGHBOR_FRAMES = 2

#: A picture back within this long was a flash.
FLASH_SECONDS = 0.25
FLASH_RETURN_SHARE = 0.5


@dataclass(frozen=True)
class CutThreshold:
    #: Times the neighbors' mean score.
    ratio: float
    #: The score a cut must reach regardless of its neighbors, on 0..255.
    score: float


#: A hard cut scores ~50 at 7-35x its neighbours; a fast pan ~12 at 1x.
CUT_THRESHOLDS: dict[SceneSensitivity, CutThreshold] = {
    "low": CutThreshold(ratio=5.0, score=30.0),
    "medium": CutThreshold(ratio=3.0, score=20.0),
    "high": CutThreshold(ratio=2.0, score=12.0),
}


def frame_features(bgr: bytes) -> np.ndarray:
    pixels = np.frombuffer(bgr, np.uint8).reshape(ANALYSIS_HEIGHT, ANALYSIS_WIDTH, 3)
    return cv2.cvtColor(pixels, cv2.COLOR_BGR2HSV).astype(np.float32)


def frame_distance(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.abs(a - b).mean())


class CutDetector:
    """Holds only the frames a decision still needs."""

    def __init__(self, sensitivity: SceneSensitivity, frame_rate: float) -> None:
        self._threshold = CUT_THRESHOLDS[sensitivity]
        self._flash = max(1, round(FLASH_SECONDS * frame_rate))
        # Waits for the frames the checks read.
        self._lookahead = max(NEIGHBOR_FRAMES, self._flash)
        self._frames: deque[tuple[int, np.ndarray]] = deque(
            maxlen=self._flash + self._lookahead + 2
        )
        self._scores: list[float] = []
        self._decided = 0
        self.cuts: list[int] = []

    def push(self, features: np.ndarray) -> None:
        index = len(self._scores)
        previous = self._frames[-1][1] if self._frames else None
        self._scores.append(0.0 if previous is None else frame_distance(previous, features))
        self._frames.append((index, features))
        self._decide_up_to(index - self._lookahead)

    def finish(self) -> list[int]:
        self._decide_up_to(len(self._scores) - 1)
        return self.cuts

    def _decide_up_to(self, last: int) -> None:
        while self._decided <= last:
            if self._decided > 0 and self._is_cut(self._decided):
                self.cuts.append(self._decided)
            self._decided += 1

    def _frame(self, index: int) -> np.ndarray | None:
        for held, features in self._frames:
            if held == index:
                return features
        return None

    def _is_cut(self, index: int) -> bool:
        score = self._scores[index]
        if score < self._threshold.score:
            return False

        # Frame 0 is never a neighbor.
        neighbors = [
            self._scores[other]
            for other in range(index - NEIGHBOR_FRAMES, index + NEIGHBOR_FRAMES + 1)
            if other != index and 0 < other < len(self._scores)
        ]
        baseline = max(float(np.mean(neighbors)) if neighbors else 0.0, 1.0)
        if score / baseline < self._threshold.ratio:
            return False

        return not self._is_flash_edge(index)

    def _is_flash_edge(self, index: int) -> bool:
        before = self._frame(index - 1)
        after = self._frame(index)
        # Closer than half the jump the edge made.
        limit = max(self._threshold.score, self._scores[index] * FLASH_RETURN_SHARE)
        # Into a flash: the earlier picture comes back soon after.
        for later in range(index + 1, index + self._flash + 1):
            frame = self._frame(later)
            if before is not None and frame is not None and frame_distance(before, frame) < limit:
                return True
        # Out of a flash: this picture was there just before.
        for earlier in range(index - self._flash - 1, index - 1):
            frame = self._frame(earlier)
            if after is not None and frame is not None and frame_distance(frame, after) < limit:
                return True
        return False
