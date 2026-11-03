import type { Size } from "./crop";
import { clamp } from "./editSpec";

/**
 * Zoom and pan for the edit stage, applied as one transform in screen space ahead of the turn and
 * mirrors, so a stroke lands where the pointer is whatever the frame's orientation.
 *
 * Offsets are CSS pixels from the stage's centre; `frame` is the canvas's unzoomed size as it lies
 * on screen (sides swapped for a quarter turn).
 */

export interface StageView {
  scale: number;
  x: number;
  y: number;
}

export const UNZOOMED: StageView = { scale: 1, x: 0, y: 0 };

export const MAX_STAGE_ZOOM = 8;

/** One wheel notch (100 px of delta) zooms by this factor. */
const ZOOM_PER_NOTCH = 1.2;
const PIXELS_PER_NOTCH = 100;
/** `deltaMode` 1 counts lines; Firefox sends those for a mouse wheel. */
const PIXELS_PER_LINE = 16;

export function wheelPixels(event: Pick<WheelEvent, "deltaY" | "deltaX" | "deltaMode">): number {
  // Shift turns a vertical wheel horizontal in some browsers; either axis zooms.
  const delta = event.deltaY || event.deltaX;
  return event.deltaMode === 1 ? delta * PIXELS_PER_LINE : delta;
}

export function wheelZoomFactor(pixels: number): number {
  return ZOOM_PER_NOTCH ** (-pixels / PIXELS_PER_NOTCH);
}

/** Keeps the zoomed frame covering the stage's middle: no panning the picture out of sight. */
function clamped(view: StageView, frame: Size): StageView {
  if (view.scale <= 1) return UNZOOMED;
  const limitX = ((view.scale - 1) * frame.width) / 2;
  const limitY = ((view.scale - 1) * frame.height) / 2;
  return {
    scale: view.scale,
    x: clamp(view.x, -limitX, limitX),
    y: clamp(view.y, -limitY, limitY),
  };
}

/** Zoom by `factor` keeping the picture point under `point` where it is. */
export function zoomAt(
  view: StageView,
  factor: number,
  point: { x: number; y: number },
  frame: Size,
): StageView {
  const scale = clamp(view.scale * factor, 1, MAX_STAGE_ZOOM);
  const ratio = scale / view.scale;
  return clamped(
    {
      scale,
      x: point.x - ratio * (point.x - view.x),
      y: point.y - ratio * (point.y - view.y),
    },
    frame,
  );
}

export function panBy(view: StageView, dx: number, dy: number, frame: Size): StageView {
  return clamped({ ...view, x: view.x + dx, y: view.y + dy }, frame);
}
