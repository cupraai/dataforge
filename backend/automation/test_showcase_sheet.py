import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from PIL import Image

from automation.showcase_sheet import (
    BACKGROUND,
    SheetCell,
    SheetGrid,
    SheetLayout,
    VideoTiming,
    build_sheet_command,
    build_sheet_filtergraph,
    make_showcase_sheet,
    plan_sheet_layout,
)
from ffmpeg_bin import ffmpeg_path
from ffmpeg_run import FfmpegCancelled
from testing_fixtures import TempMediaFolder, playable_video_bytes


def measure(text: str, size: int) -> float:
    """A monospace stand-in: every character is as wide as half the size."""
    return len(text) * size / 2


def write_png(folder: Path, name: str, size: tuple[int, int], colour: tuple[int, int, int]) -> Path:
    path = folder / name
    Image.new("RGB", size, colour).save(path, format="PNG")
    return path


def filled(rows: int, columns: int, *, captions: bool = False, **labels: tuple) -> SheetGrid:
    cells = tuple(
        SheetCell(Path("any.png"), row, column, "Seed 1" if captions else "")
        for row in range(rows)
        for column in range(columns)
    )
    return SheetGrid(cells, **labels)


def make(folder: Path, grid: SheetGrid, prefix: str = "sheet") -> Path:
    return make_showcase_sheet(folder, prefix, grid, should_cancel=None, report=lambda _name: None)


class LayoutTests(unittest.TestCase):
    def test_cells_take_the_first_files_shape_and_every_side_is_even(self) -> None:
        layout = plan_sheet_layout(filled(2, 3), (513, 1025), measure=measure, max_side=8192)

        self.assertEqual((layout.cell_width, layout.cell_height), (512, 1024))
        self.assertEqual(layout.header_height, 0)
        self.assertEqual(layout.label_width, 0)
        self.assertEqual(layout.width % 2, 0)
        self.assertEqual(layout.height % 2, 0)
        self.assertEqual(layout.width, layout.gap + 3 * (512 + layout.gap))

    def test_labels_add_their_bands(self) -> None:
        plain = plan_sheet_layout(filled(2, 2), (400, 400), measure=measure, max_side=8192)
        grid = filled(
            2,
            2,
            captions=True,
            row_labels=("Beach", "Forest"),
            column_labels=("step 1000", ""),
        )
        labelled = plan_sheet_layout(grid, (400, 400), measure=measure, max_side=8192)

        self.assertGreater(labelled.header_height, 0)
        self.assertGreater(labelled.caption_height, 0)
        self.assertEqual(labelled.label_width, labelled.font_px * 3 + labelled.gap)
        self.assertGreater(labelled.height, plain.height)

    def test_both_sides_are_even_whatever_is_labelled(self) -> None:
        """The encoder refuses an odd side."""
        for side in range(100, 1400, 37):
            for rows, columns in ((1, 1), (4, 3), (5, 8)):
                for labels in (("Beach", "Forest"), ()):
                    for captions in (True, False):
                        with self.subTest(side=side, rows=rows, labels=labels, captions=captions):
                            grid = filled(
                                rows,
                                columns,
                                captions=captions,
                                row_labels=labels,
                                column_labels=labels,
                            )
                            layout = plan_sheet_layout(
                                grid, (side, side * 2 // 3), measure=measure, max_side=3840
                            )
                            self.assertEqual((layout.width % 2, layout.height % 2), (0, 0))

    def test_a_sheet_over_the_cap_shrinks_its_cells(self) -> None:
        layout = plan_sheet_layout(filled(8, 8), (1024, 1024), measure=measure, max_side=3840)

        self.assertLessEqual(max(layout.width, layout.height), 3840)
        self.assertLess(layout.cell_width, 1024)

    def test_origins_step_by_cell_and_gap(self) -> None:
        layout = SheetLayout(2, 2, 100, 50, 12, 8, 20, 30, 10)

        self.assertEqual(layout.cell_origin(0, 0), (38, 28))
        self.assertEqual(layout.cell_origin(1, 1), (38 + 108, 28 + 68))


class ImageSheetTests(unittest.TestCase):
    def test_each_file_lands_in_its_cell_and_gaps_stay_background(self) -> None:
        with TempMediaFolder() as root:
            red = write_png(root, "red.png", (64, 64), (255, 0, 0))
            blue = write_png(root, "blue.png", (64, 32), (0, 0, 255))
            path = make(root, SheetGrid((SheetCell(red, 0, 0), SheetCell(blue, 1, 1))))

            self.assertEqual(path, root / "sheet_0001.png")
            with Image.open(path) as sheet:
                sheet = sheet.convert("RGB")
                gap = (sheet.width - 2 * 64) // 3
                self.assertEqual(sheet.getpixel((gap + 32, gap + 32)), (255, 0, 0))
                second = (2 * gap + 64 + 32, 2 * gap + 64 + 32)
                self.assertEqual(sheet.getpixel(second), (0, 0, 255))
                # The wide file is letterboxed, and the empty cell stays background.
                self.assertEqual(sheet.getpixel((second[0], 2 * gap + 64 + 2)), BACKGROUND)
                self.assertEqual(sheet.getpixel((2 * gap + 64 + 32, gap + 32)), BACKGROUND)

    def test_labels_are_drawn_and_numbers_never_clobber(self) -> None:
        with TempMediaFolder() as root:
            red = write_png(root, "red.png", (200, 200), (255, 0, 0))
            (root / "board_0001.png").write_bytes(b"taken")
            grid = SheetGrid((SheetCell(red, 0, 0, "Seed 1"),), ("Beach",), ("step 1000",))
            path = make(root, grid, "board")

            self.assertEqual(path.name, "board_0002.png")
            with Image.open(path) as sheet:
                sheet = sheet.convert("RGB")
                header = sheet.crop((0, 0, sheet.width, 20))
                colours = {colour for _, colour in header.getcolors(maxcolors=100000) or []}
                self.assertGreater(len(colours), 1)


class VideoSheetTests(unittest.TestCase):
    def clip_and_still(self, root: Path) -> tuple:
        clip = root / "clip.mp4"
        clip.write_bytes(playable_video_bytes())
        still = write_png(root, "still.png", (64, 64), (255, 0, 0))
        cells = (SheetCell(clip, 0, 0), SheetCell(still, 0, 1))
        layout = SheetLayout(1, 2, 64, 64, 12, 8, 20, 0, 0)
        return SheetGrid(cells, column_labels=("a", "b")), layout, clip, still

    @unittest.skipIf(ffmpeg_path() is None, "needs ffmpeg")
    def test_the_graph_holds_short_clips_and_drops_their_rotation(self) -> None:
        with TempMediaFolder() as root:
            grid, layout, clip, still = self.clip_and_still(root)
            timing = VideoTiming(seconds=2.0, fps=24.0)

            graph = build_sheet_filtergraph(grid, layout, timing)
            command = build_sheet_command(
                grid,
                root / "canvas.png",
                root / "graph.txt",
                root / "out.mp4",
                timing,
                executable="ffmpeg",
            )

            self.assertIn("tpad=stop_mode=clone:stop=-1", graph)
            self.assertIn("overlay=x=8:y=28", graph)
            self.assertTrue(graph.endswith("sidedata=mode=delete:type=DISPLAYMATRIX[v]"))
            self.assertIn("-an", command)
            self.assertEqual(command[command.index("-t") + 1], "2.000")
            self.assertEqual(
                command[command.index("-/filter_complex") + 1], str(root / "graph.txt")
            )
            # A still loops for the whole sheet; a clip is read as it is.
            still_input = command.index(str(still))
            self.assertEqual(command[still_input - 5 : still_input - 3], ["-loop", "1"])
            self.assertNotEqual(command[command.index(str(clip)) - 2], "1")

    @unittest.skipIf(ffmpeg_path() is None, "needs ffmpeg")
    def test_a_sheet_with_a_clip_is_an_mp4(self) -> None:
        with TempMediaFolder() as root:
            grid, *_ = self.clip_and_still(root)
            path = make(root, grid)

            self.assertTrue(grid.moving)
            self.assertEqual(path.suffix, ".mp4")
            self.assertGreater(path.stat().st_size, 0)

    def test_a_cancelled_encode_leaves_no_file(self) -> None:
        with TempMediaFolder() as root:
            grid, *_ = self.clip_and_still(root)
            before = sorted(root.iterdir())
            with (
                patch("automation.showcase_sheet.ffmpeg_path", return_value="ffmpeg"),
                patch("automation.showcase_sheet.run_ffmpeg", side_effect=FfmpegCancelled),
                self.assertRaises(FfmpegCancelled),
            ):
                make(root, grid)

            self.assertEqual(sorted(root.iterdir()), before)


if __name__ == "__main__":
    unittest.main()
