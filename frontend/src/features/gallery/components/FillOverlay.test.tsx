import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FillOverlay } from "./FillOverlay";
import type { FillPoint } from "@/features/gallery/lib/fillMask";
import type { Orientation } from "@/features/gallery/lib/crop";

const SOURCE = { width: 4000, height: 2000 };
const BOX = { width: 800, height: 400 };

function mediaRefWithBox() {
  // jsdom lays nothing out, so the element is told where it sits and how big it is.
  const host = document.createElement("div");
  const media = document.createElement("img");
  host.appendChild(media);
  document.body.appendChild(host);
  const define = (key: string, value: unknown) =>
    Object.defineProperty(media, key, { value, configurable: true });
  define("offsetParent", host);
  define("offsetLeft", 0);
  define("offsetTop", 0);
  define("offsetWidth", BOX.width);
  define("offsetHeight", BOX.height);
  const ref = createRef<HTMLImageElement>();
  (ref as { current: HTMLImageElement }).current = media;
  return ref;
}

class PointerEventPolyfill extends MouseEvent {
  readonly pointerId: number;

  constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
  }
}

/** Where the overlay sits on screen: upright, or turned a quarter so its box is tall. */
let screenRect = { left: 100, top: 50, width: BOX.width, height: BOX.height };
const originalRect = HTMLElement.prototype.getBoundingClientRect;

beforeEach(() => {
  vi.stubGlobal("PointerEvent", PointerEventPolyfill);
  screenRect = { left: 100, top: 50, width: BOX.width, height: BOX.height };
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    if (!this.classList.contains("fill-overlay")) return originalRect.call(this);
    const { left, top, width, height } = screenRect;
    return { left, top, width, height, right: left + width, bottom: top + height } as DOMRect;
  };
  const captured = new Set<Element>();
  Element.prototype.setPointerCapture = vi.fn<(pointerId: number) => void>(function (
    this: Element,
  ) {
    captured.add(this);
  });
  Element.prototype.releasePointerCapture = vi.fn<(pointerId: number) => void>(function (
    this: Element,
  ) {
    captured.delete(this);
  });
  Element.prototype.hasPointerCapture = vi.fn<(pointerId: number) => boolean>(function (
    this: Element,
  ) {
    return captured.has(this);
  });
});

afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = originalRect;
  vi.unstubAllGlobals();
});

type Props = Parameters<typeof FillOverlay>[0];

function renderOverlay(overrides: Partial<Props> = {}) {
  const props: Props = {
    mediaRef: mediaRefWithBox(),
    sourceWidth: SOURCE.width,
    sourceHeight: SOURCE.height,
    orientation: { rotate: 0, mirrorH: false, mirrorV: false },
    strokes: [],
    brushRadius: 40,
    erasing: false,
    interactive: true,
    showStrokes: true,
    onBegin: vi.fn<(point: FillPoint) => void>(),
    onExtend: vi.fn<(point: FillPoint) => void>(),
    ...overrides,
  };
  render(<FillOverlay {...props} />);
  return { ...props, surface: screen.getByTestId("fill-overlay") };
}

describe("FillOverlay", () => {
  it("paints in original pixels wherever the stage draws the frame", () => {
    const { surface, onBegin, onExtend } = renderOverlay();

    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 100, clientY: 50 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 500, clientY: 250 });
    fireEvent.pointerUp(surface, { pointerId: 1 });

    expect(onBegin).toHaveBeenCalledWith({ x: 0, y: 0 });
    expect(onExtend).toHaveBeenCalledWith({ x: 2000, y: 1000 });
  });

  it("follows the frame through a quarter turn and a mirror", () => {
    // Turned clockwise and then seen in a mirror: the frame's origin lands bottom right.
    const orientation: Orientation = { rotate: 90, mirrorH: true, mirrorV: false };
    screenRect = { left: 300, top: -150, width: BOX.height, height: BOX.width };
    const { surface, onBegin } = renderOverlay({ orientation });

    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 700, clientY: 650 });

    const [point] = vi.mocked(onBegin).mock.calls[0];
    expect(point.x).toBeCloseTo(0);
    expect(point.y).toBeCloseTo(0);
  });

  it("skips moves too small to change the stroke", () => {
    const { surface, onExtend } = renderOverlay({ brushRadius: 200 });

    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 300, clientY: 150 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 302, clientY: 150 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 400, clientY: 150 });

    expect(onExtend).toHaveBeenCalledTimes(1);
  });

  it("ignores the pointer while painting is locked, and moves without a press", () => {
    const { surface, onBegin, onExtend } = renderOverlay({ interactive: false });

    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 300, clientY: 150 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 400, clientY: 150 });

    expect(onBegin).not.toHaveBeenCalled();
    expect(onExtend).not.toHaveBeenCalled();
    expect(surface).not.toHaveClass("fill-overlay--interactive");
  });

  it("shows a ring the size of the brush where the pointer hovers", () => {
    const { surface } = renderOverlay({ brushRadius: 100, erasing: true });

    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 500, clientY: 250 });

    const ring = document.querySelector<HTMLElement>(".fill-overlay__cursor");
    expect(ring).toHaveClass("fill-overlay__cursor--erase");
    // 200 original pixels across, on a box a fifth the original's width.
    expect(ring?.style.width).toBe("40px");
    expect(ring?.style.left).toBe("50%");
  });
});
