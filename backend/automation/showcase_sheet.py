"""A showcase's results on one labelled grid, as a PNG, or an MP4 if any of them moves.

Every cell is letterboxed into one box, shaped like the first cell. A video sheet runs as long
as its longest clip; shorter clips hold their last frame and stills stay put.
"""

from __future__ import annotations

import math
import tempfile
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

from automation.job_runner import ShouldCancel
from automation.watermark import resolve_watermark_font
from constants import (
    MAX_SHEET_CELL_SIDE,
    MAX_SHEET_FPS,
    MAX_SHEET_IMAGE_SIDE,
    MAX_SHEET_SECONDS,
    MAX_SHEET_VIDEO_SIDE,
    MOTION_EXTENSIONS,
)
from ffmpeg_bin import ffmpeg_path
from ffmpeg_run import FFMPEG_QUIET_ARGS, run_ffmpeg
from image_io import ImageReadError, displayed_size, load_image_for_edit
from numbered_files import next_number, publish_numbered, temporary_file
from video_edit import probe_source

BACKGROUND = (20, 20, 20)
TEXT = (238, 238, 238)
#: ffmpeg's spelling of BACKGROUND, for the letterbox around clips.
_FFMPEG_BACKGROUND = "0x141414"

#: Label size as a share of the cell's short side, within these bounds in pixels.
_FONT_SHARE = 0.045
_MIN_FONT_PX = 12
_MAX_FONT_PX = 48

DEFAULT_SHEET_FPS = 24.0
#: A clip whose length cannot be read still shows for this long.
DEFAULT_SHEET_SECONDS = 5.0

#: How wide a text is at a font size, in pixels.
Measure = Callable[[str, int], float]


def _is_motion(path: Path) -> bool:
    return path.suffix.lower() in MOTION_EXTENSIONS


@dataclass(frozen=True)
class SheetCell:
    path: Path
    row: int
    column: int
    #: Drawn under the cell; empty draws none.
    label: str = ""


@dataclass(frozen=True)
class SheetGrid:
    """Cells may leave gaps; a position without one stays blank."""

    cells: tuple[SheetCell, ...]
    #: Drawn left of each row; empty draws no label column.
    row_labels: tuple[str, ...] = ()
    #: Drawn above each column; empty draws no label row.
    column_labels: tuple[str, ...] = ()

    @property
    def rows(self) -> int:
        return max(cell.row for cell in self.cells) + 1

    @property
    def columns(self) -> int:
        return max(cell.column for cell in self.cells) + 1

    @property
    def moving(self) -> bool:
        return any(_is_motion(cell.path) for cell in self.cells)


@dataclass(frozen=True)
class SheetLayout:
    rows: int
    columns: int
    cell_width: int
    cell_height: int
    font_px: int
    gap: int
    #: The band above the grid holding column labels; 0 without any.
    header_height: int
    #: The column left of the grid holding row labels; 0 without any.
    label_width: int
    #: The band under every cell holding its own label; 0 without any.
    caption_height: int

    @property
    def width(self) -> int:
        return self.label_width + self.gap + self.columns * (self.cell_width + self.gap)

    @property
    def height(self) -> int:
        row_height = self.cell_height + self.caption_height + self.gap
        return self.header_height + self.gap + self.rows * row_height

    def cell_origin(self, row: int, column: int) -> tuple[int, int]:
        x = self.label_width + self.gap + column * (self.cell_width + self.gap)
        y = (
            self.header_height
            + self.gap
            + row * (self.cell_height + self.caption_height + self.gap)
        )
        return x, y


def _even(value: float) -> int:
    return max(2, int(value) // 2 * 2)


def _layout(grid: SheetGrid, cell: tuple[int, int], measure: Measure) -> SheetLayout:
    width, height = cell
    font_px = round(min(max(min(width, height) * _FONT_SHARE, _MIN_FONT_PX), _MAX_FONT_PX))
    gap = max(4, _even(font_px * 0.6))
    line = round(font_px * 1.3)
    widest = max((measure(label, font_px) for label in grid.row_labels if label), default=0.0)
    return SheetLayout(
        rows=grid.rows,
        columns=grid.columns,
        cell_width=width,
        cell_height=height,
        font_px=font_px,
        gap=gap,
        # Even like everything else: the encoder refuses an odd side.
        header_height=_even(line + gap) if any(grid.column_labels) else 0,
        label_width=_even(min(widest + gap, width)) if widest else 0,
        caption_height=_even(line + gap // 2) if any(cell.label for cell in grid.cells) else 0,
    )


def plan_sheet_layout(
    grid: SheetGrid, first_size: tuple[int, int], *, measure: Measure, max_side: int
) -> SheetLayout:
    """Cells take the first file's shape, as large as both caps allow; every side is even."""
    first_width, first_height = first_size
    scale = min(1.0, MAX_SHEET_CELL_SIDE / max(first_width, first_height, 1))
    layout = _layout(grid, (_even(first_width * scale), _even(first_height * scale)), measure)
    # Labels shrink with the cells, so a second pass can still be over by a pixel or two.
    for _ in range(4):
        over = max(layout.width, layout.height) / max_side
        if over <= 1:
            break
        cell = (_even(layout.cell_width / over), _even(layout.cell_height / over))
        layout = _layout(grid, cell, measure)
    return layout


def _font(font_path: Path | None, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    if font_path is None:
        return ImageFont.load_default(size)
    return ImageFont.truetype(str(font_path), size)


def _fitted(text: str, font: ImageFont.FreeTypeFont | ImageFont.ImageFont, width: float) -> str:
    """Cut to ``width`` with an ellipsis."""
    if font.getlength(text) <= width:
        return text
    while text and font.getlength(f"{text}…") > width:
        text = text[:-1]
    return f"{text.rstrip()}…" if text else ""


def render_canvas(grid: SheetGrid, layout: SheetLayout, font_path: Path | None) -> Image.Image:
    """The background and every label; the media goes on top."""
    canvas = Image.new("RGB", (layout.width, layout.height), BACKGROUND)
    draw = ImageDraw.Draw(canvas)
    font = _font(font_path, layout.font_px)
    middle = layout.font_px * 0.65

    for column, label in enumerate(grid.column_labels):
        if label:
            x, _ = layout.cell_origin(0, column)
            text = _fitted(label, font, layout.cell_width)
            centre = x + layout.cell_width / 2
            draw.text((centre, layout.gap + middle), text, font=font, fill=TEXT, anchor="mm")
    for row, label in enumerate(grid.row_labels):
        if label:
            _, y = layout.cell_origin(row, 0)
            text = _fitted(label, font, layout.label_width - layout.gap)
            centre = y + layout.cell_height / 2
            draw.text((layout.gap, centre), text, font=font, fill=TEXT, anchor="lm")
    for cell in grid.cells:
        if cell.label:
            x, y = layout.cell_origin(cell.row, cell.column)
            text = _fitted(cell.label, font, layout.cell_width)
            top = y + layout.cell_height + layout.gap // 4 + middle
            draw.text((x + layout.cell_width / 2, top), text, font=font, fill=TEXT, anchor="mm")
    return canvas


def _media_size(path: Path) -> tuple[int, int]:
    if _is_motion(path):
        size = probe_source(path).size
        if size is None:
            raise ValueError(f"{path.name} could not be read as a video.")
        return size
    try:
        with Image.open(path) as opened:
            return displayed_size(opened)
    except OSError as exc:
        raise ValueError(f"{path.name} could not be read as an image: {exc}") from exc


def _measure(font_path: Path | None) -> Measure:
    fonts: dict[int, ImageFont.FreeTypeFont | ImageFont.ImageFont] = {}

    def measure(text: str, size: int) -> float:
        font = fonts.setdefault(size, _font(font_path, size))
        return float(font.getlength(text))

    return measure


def _paste_still(canvas: Image.Image, layout: SheetLayout, cell: SheetCell) -> None:
    try:
        image, _, _ = load_image_for_edit(cell.path)
    except ImageReadError as exc:
        raise ValueError(f"{cell.path.name} could not be read as an image: {exc}") from exc
    fitted = ImageOps.contain(
        image, (layout.cell_width, layout.cell_height), Image.Resampling.LANCZOS
    )
    x, y = layout.cell_origin(cell.row, cell.column)
    offset = (
        x + (layout.cell_width - fitted.width) // 2,
        y + (layout.cell_height - fitted.height) // 2,
    )
    canvas.paste(fitted, offset, fitted)


def compose_image_sheet(
    grid: SheetGrid, layout: SheetLayout, font_path: Path | None
) -> Image.Image:
    canvas = render_canvas(grid, layout, font_path)
    for cell in grid.cells:
        _paste_still(canvas, layout, cell)
    return canvas


@dataclass(frozen=True)
class VideoTiming:
    seconds: float
    fps: float


def video_timing(paths: Sequence[Path]) -> VideoTiming:
    """As long as the longest clip, as smooth as the smoothest, within the caps."""
    probes = [probe_source(path) for path in paths if _is_motion(path)]
    seconds = max((probe.seconds for probe in probes if probe.seconds), default=None)
    fps = max((probe.frame_rate for probe in probes if probe.frame_rate), default=None)
    return VideoTiming(
        seconds=min(seconds or DEFAULT_SHEET_SECONDS, MAX_SHEET_SECONDS),
        fps=min(fps or DEFAULT_SHEET_FPS, MAX_SHEET_FPS),
    )


def _rate(value: float) -> str:
    return f"{value:.6g}"


def build_sheet_filtergraph(grid: SheetGrid, layout: SheetLayout, timing: VideoTiming) -> str:
    """Input 0 is the canvas; input ``k`` is the ``k``-th cell."""
    width, height = layout.cell_width, layout.cell_height
    fps = _rate(timing.fps)
    chains: list[str] = []
    previous = "0:v"
    for index, cell in enumerate(grid.cells, start=1):
        x, y = layout.cell_origin(cell.row, cell.column)
        chains.append(
            f"[{index}:v]scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color={_FFMPEG_BACKGROUND},setsar=1,"
            f"fps={fps},tpad=stop_mode=clone:stop=-1[c{index}]"
        )
        chains.append(f"[{previous}][c{index}]overlay=x={x}:y={y}:eof_action=repeat[t{index}]")
        previous = f"t{index}"
    # Two-input graphs carry the clip's rotation onto pixels that are already upright.
    chains.append(f"[{previous}]format=yuv420p,sidedata=mode=delete:type=DISPLAYMATRIX[v]")
    return ";\n".join(chains)


def build_sheet_command(
    grid: SheetGrid,
    canvas_path: Path,
    graph_path: Path,
    destination: Path,
    timing: VideoTiming,
    *,
    executable: str,
) -> list[str]:
    fps = _rate(timing.fps)
    command = [
        executable,
        *FFMPEG_QUIET_ARGS,
        "-progress",
        "pipe:1",
        "-y",
        "-loop",
        "1",
        "-framerate",
        fps,
        "-i",
        str(canvas_path),
    ]
    for cell in grid.cells:
        if _is_motion(cell.path):
            command += ["-i", str(cell.path)]
        else:
            command += ["-loop", "1", "-framerate", fps, "-i", str(cell.path)]
    command += [
        # The graph grows with every cell; read from a file it never meets a length limit.
        "-/filter_complex",
        str(graph_path),
        "-map",
        "[v]",
        "-an",
        "-t",
        f"{timing.seconds:.3f}",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-f",
        "mp4",
        str(destination),
    ]
    return command


def _encode_video_sheet(
    grid: SheetGrid,
    layout: SheetLayout,
    font_path: Path | None,
    destination: Path,
    should_cancel: ShouldCancel | None,
    report: Callable[[str], None],
) -> None:
    executable = ffmpeg_path()
    if executable is None:
        raise ValueError("A sheet of videos needs ffmpeg.")
    timing = video_timing([cell.path for cell in grid.cells])
    total = math.ceil(timing.seconds)

    with tempfile.TemporaryDirectory(prefix="dataforge-sheet-") as scratch:
        canvas_path = Path(scratch) / "canvas.png"
        graph_path = Path(scratch) / "graph.txt"
        render_canvas(grid, layout, font_path).save(canvas_path, format="PNG")
        graph_path.write_text(build_sheet_filtergraph(grid, layout, timing), encoding="utf-8")
        command = build_sheet_command(
            grid, canvas_path, graph_path, destination, timing, executable=executable
        )
        report(f"Showcase sheet: 0 of {total} seconds")
        run_ffmpeg(
            command,
            should_cancel=should_cancel,
            on_progress=lambda seconds: report(
                f"Showcase sheet: {min(math.floor(seconds), total)} of {total} seconds"
            ),
        )


def make_showcase_sheet(
    folder: Path,
    prefix: str,
    grid: SheetGrid,
    *,
    should_cancel: ShouldCancel | None,
    report: Callable[[str], None],
) -> Path:
    """Writes the next free ``<prefix>_0001`` in ``folder``. Raises ``FfmpegCancelled``."""
    font_path = resolve_watermark_font()
    layout = plan_sheet_layout(
        grid,
        _media_size(grid.cells[0].path),
        measure=_measure(font_path),
        max_side=MAX_SHEET_VIDEO_SIDE if grid.moving else MAX_SHEET_IMAGE_SIDE,
    )
    with temporary_file(folder) as temp_path:
        if grid.moving:
            suffix = ".mp4"
            _encode_video_sheet(grid, layout, font_path, temp_path, should_cancel, report)
        else:
            suffix = ".png"
            compose_image_sheet(grid, layout, font_path).save(temp_path, format="PNG")
        return publish_numbered(
            temp_path, folder, prefix, suffix, next_number(folder, prefix), "sheet"
        )
