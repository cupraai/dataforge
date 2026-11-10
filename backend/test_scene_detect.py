from __future__ import annotations

import unittest

import cv2
import numpy as np

from scene_detect import ANALYSIS_HEIGHT, ANALYSIS_WIDTH, CutDetector

RATE = 24


def _flat(value: int) -> np.ndarray:
    return np.full((ANALYSIS_HEIGHT, ANALYSIS_WIDTH, 3), value, np.float32)


def _scenery(seed: int, shift: int = 0) -> np.ndarray:
    """Smooth random scenery slid sideways by ``shift`` pixels, as a pan would."""
    rng = np.random.default_rng(seed)
    coarse = rng.integers(0, 256, (4, 16, 3)).astype(np.float32)
    wide = cv2.resize(coarse, (ANALYSIS_WIDTH * 4, ANALYSIS_HEIGHT), interpolation=cv2.INTER_CUBIC)
    return wide[:, shift : shift + ANALYSIS_WIDTH]


def _cuts(frames: list[np.ndarray], sensitivity: str = "medium") -> list[int]:
    detector = CutDetector(sensitivity, RATE)  # type: ignore[arg-type]
    for frame in frames:
        detector.push(frame)
    return detector.finish()


class CutDetectorTests(unittest.TestCase):
    def test_a_hard_cut_opens_a_scene_at_its_first_frame(self) -> None:
        frames = [_flat(40)] * 30 + [_flat(200)] * 30

        self.assertEqual(_cuts(frames), [30])

    def test_a_cut_out_of_a_pan_is_found_and_the_pan_is_not_a_cut(self) -> None:
        pan = [_scenery(1, shift) for shift in range(0, 90, 3)]
        other = [_scenery(2, shift) for shift in range(0, 90, 3)]

        self.assertEqual(_cuts(pan + other), [30])

    def test_a_flash_is_not_a_cut(self) -> None:
        scene = [_flat(60)] * 20
        flash = [_flat(255)] * 2

        for sensitivity in ("low", "medium", "high"):
            with self.subTest(sensitivity=sensitivity):
                self.assertEqual(_cuts(scene + flash + scene, sensitivity), [])

    def test_a_gradual_change_is_not_a_cut(self) -> None:
        frames = [_flat(min(255, 40 + step * 4)) for step in range(60)]

        self.assertEqual(_cuts(frames), [])

    def test_a_cut_in_the_last_frames_is_still_decided(self) -> None:
        frames = [_flat(40)] * 30 + [_flat(200)]

        self.assertEqual(_cuts(frames), [30])


if __name__ == "__main__":
    unittest.main()
