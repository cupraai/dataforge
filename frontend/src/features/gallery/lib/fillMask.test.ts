import { describe, expect, it } from "vitest";
import type { Orientation } from "./crop";
import {
  brushRadiusPx,
  clientPointToFraction,
  describeFills,
  fractionToSource,
  hasPaint,
  type FillStroke,
} from "./fillMask";

/** The overlay is 200 x 100 upright; turned a quarter, its box on screen is 100 x 200. */
const UPRIGHT_RECT = { left: 50, top: 20, width: 200, height: 100 };
const TURNED_RECT = { left: 100, top: -30, width: 100, height: 200 };

function corner(rect: typeof UPRIGHT_RECT, x: "left" | "right", y: "top" | "bottom") {
  return {
    clientX: x === "left" ? rect.left : rect.left + rect.width,
    clientY: y === "top" ? rect.top : rect.top + rect.height,
  };
}

function at(
  rect: typeof UPRIGHT_RECT,
  orientation: Orientation,
  x: "left" | "right",
  y: "top" | "bottom",
) {
  const { clientX, clientY } = corner(rect, x, y);
  const point = clientPointToFraction(clientX, clientY, rect, orientation);
  return { x: Math.round(point.x * 100) / 100, y: Math.round(point.y * 100) / 100 };
}

const ORIGIN = { x: 0, y: 0 };

describe("clientPointToFraction", () => {
  it("maps the upright frame's corners onto themselves", () => {
    const upright: Orientation = { rotate: 0, mirrorH: false, mirrorV: false };

    expect(at(UPRIGHT_RECT, upright, "left", "top")).toEqual(ORIGIN);
    expect(at(UPRIGHT_RECT, upright, "right", "bottom")).toEqual({ x: 1, y: 1 });
    const middle = clientPointToFraction(150, 70, UPRIGHT_RECT, upright);
    expect(middle).toEqual({ x: 0.5, y: 0.5 });
  });

  // The frame's top-left pixel, wherever the stage's transform puts it on screen.
  it.each<[string, Orientation, typeof UPRIGHT_RECT, "left" | "right", "top" | "bottom"]>([
    [
      "a quarter turn clockwise",
      { rotate: 90, mirrorH: false, mirrorV: false },
      TURNED_RECT,
      "right",
      "top",
    ],
    [
      "a half turn",
      { rotate: 180, mirrorH: false, mirrorV: false },
      UPRIGHT_RECT,
      "right",
      "bottom",
    ],
    [
      "a quarter turn back",
      { rotate: 270, mirrorH: false, mirrorV: false },
      TURNED_RECT,
      "left",
      "bottom",
    ],
    [
      "a horizontal mirror",
      { rotate: 0, mirrorH: true, mirrorV: false },
      UPRIGHT_RECT,
      "right",
      "top",
    ],
    [
      "a vertical mirror",
      { rotate: 0, mirrorH: false, mirrorV: true },
      UPRIGHT_RECT,
      "left",
      "bottom",
    ],
    [
      "a mirror, then a quarter turn",
      { rotate: 90, mirrorH: true, mirrorV: false },
      TURNED_RECT,
      "right",
      "bottom",
    ],
  ])("finds the frame's origin under %s", (_name, orientation, rect, x, y) => {
    expect(at(rect, orientation, x, y)).toEqual(ORIGIN);
  });

  it("measures a turned frame against its own sides, not the screen's", () => {
    const turned: Orientation = { rotate: 90, mirrorH: false, mirrorV: false };
    // A quarter of the way down the screen box is a quarter of the way across the frame.
    const point = clientPointToFraction(150, -30 + 50, TURNED_RECT, turned);

    expect(point.x).toBeCloseTo(0.25);
    expect(point.y).toBeCloseTo(0.5);
  });

  it("scales fractions to original pixels", () => {
    expect(fractionToSource({ x: 0.25, y: 0.5 }, { width: 4000, height: 3000 })).toEqual({
      x: 1000,
      y: 1500,
    });
  });
});

describe("brush", () => {
  it("sizes the brush from the shorter side and never below a pixel", () => {
    expect(brushRadiusPx(0.03, { width: 4000, height: 3000 })).toBe(90);
    expect(brushRadiusPx(0.005, { width: 40, height: 30 })).toBe(1);
  });

  it("needs a painted stroke before anything can be filled", () => {
    const erase: FillStroke = { mode: "erase", radius: 4, points: [{ x: 1, y: 1 }] };
    const paint: FillStroke = { mode: "paint", radius: 4, points: [{ x: 1, y: 1 }] };

    expect(hasPaint([])).toBe(false);
    expect(hasPaint([erase])).toBe(false);
    expect(hasPaint([erase, paint])).toBe(true);
  });

  it("counts fills for the output line", () => {
    expect(describeFills(1)).toBe("1 fill");
    expect(describeFills(3)).toBe("3 fills");
  });
});
