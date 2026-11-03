import { describe, expect, it } from "vitest";
import {
  MAX_STAGE_ZOOM,
  UNZOOMED,
  panBy,
  wheelPixels,
  wheelZoomFactor,
  zoomAt,
  type StageView,
} from "./stageZoom";

const FRAME = { width: 800, height: 400 };

/** Where a picture point `local` (offset from the frame's centre, unzoomed) shows on screen. */
function onScreen(view: StageView, local: { x: number; y: number }) {
  return { x: view.x + view.scale * local.x, y: view.y + view.scale * local.y };
}

describe("zoomAt", () => {
  it("keeps the picture point under the pointer where it was", () => {
    const pointer = { x: 120, y: -60 };
    const local = { x: 120, y: -60 };

    const once = zoomAt(UNZOOMED, 2, pointer, FRAME);
    const twice = zoomAt(once, 1.5, pointer, FRAME);

    expect(onScreen(once, local)).toEqual(pointer);
    const after = onScreen(twice, local);
    expect(after.x).toBeCloseTo(pointer.x);
    expect(after.y).toBeCloseTo(pointer.y);
  });

  it("never zooms out past the whole picture, and recentres there", () => {
    const zoomed = zoomAt(UNZOOMED, 3, { x: 200, y: 100 }, FRAME);

    expect(zoomAt(zoomed, 0.1, { x: -50, y: 0 }, FRAME)).toEqual(UNZOOMED);
    expect(zoomAt(UNZOOMED, 0.5, { x: 10, y: 10 }, FRAME)).toEqual(UNZOOMED);
  });

  it("stops at the maximum", () => {
    expect(zoomAt(UNZOOMED, 1000, { x: 0, y: 0 }, FRAME).scale).toBe(MAX_STAGE_ZOOM);
  });

  it("keeps the picture covering the stage's middle when zooming at its edge", () => {
    const view = zoomAt(UNZOOMED, 2, { x: 4000, y: 4000 }, FRAME);

    // At 2x the frame may move half its own size, no more.
    expect(view).toEqual({ scale: 2, x: -400, y: -200 });
  });
});

describe("panBy", () => {
  it("moves a zoomed picture and stops at its edges", () => {
    const zoomed: StageView = { scale: 2, x: 0, y: 0 };

    expect(panBy(zoomed, 30, -20, FRAME)).toEqual({ scale: 2, x: 30, y: -20 });
    expect(panBy(zoomed, 9999, 9999, FRAME)).toEqual({ scale: 2, x: 400, y: 200 });
  });

  it("does nothing to the whole picture", () => {
    expect(panBy(UNZOOMED, 50, 50, FRAME)).toEqual(UNZOOMED);
  });
});

describe("the wheel", () => {
  it("zooms in on a notch up and back out by the same amount on a notch down", () => {
    expect(wheelZoomFactor(-100)).toBeCloseTo(1.2);
    expect(wheelZoomFactor(-100) * wheelZoomFactor(100)).toBeCloseTo(1);
  });

  it("reads lines as pixels, and a sideways wheel too", () => {
    expect(wheelPixels({ deltaY: -3, deltaX: 0, deltaMode: 1 })).toBe(-48);
    expect(wheelPixels({ deltaY: 0, deltaX: 100, deltaMode: 0 })).toBe(100);
  });
});
