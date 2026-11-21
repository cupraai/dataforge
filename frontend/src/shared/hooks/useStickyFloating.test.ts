import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createRef } from "react";
import { useStickyFloating } from "./useStickyFloating";

function mockRect(element: HTMLElement, top: number, bottom: number) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    top,
    bottom,
    left: 0,
    right: 1000,
    width: 1000,
    height: bottom - top,
    x: 0,
    y: top,
    toJSON: () => ({}),
  });
}

function setup(sentinelTop: number, elementTop: number, inScrollRoot = true) {
  const sentinel = document.createElement("div");
  const element = document.createElement("section");
  const parent = document.createElement(inScrollRoot ? "main" : "div");
  if (inScrollRoot) parent.className = "main";
  parent.append(sentinel, element);
  document.body.append(parent);

  mockRect(parent, 100, 800);
  mockRect(sentinel, sentinelTop, sentinelTop);
  mockRect(element, elementTop, elementTop + 90);

  const sentinelRef = createRef<HTMLDivElement>();
  sentinelRef.current = sentinel;
  const elementRef = createRef<HTMLElement>();
  elementRef.current = element;

  return { sentinelRef, elementRef };
}

describe("useStickyFloating", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("returns false while the element rests on its sentinel", async () => {
    const { sentinelRef, elementRef } = setup(150, 150);

    const { result } = renderHook(() => useStickyFloating(sentinelRef, elementRef));

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });

  it("returns true once sticky holds the element below its sentinel", async () => {
    // The sentinel scrolled away while the element stayed docked lower, as with an offset dock.
    const { sentinelRef, elementRef } = setup(40, 160);

    const { result } = renderHook(() => useStickyFloating(sentinelRef, elementRef));

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it("ignores sub-pixel layout drift", async () => {
    const { sentinelRef, elementRef } = setup(150, 150.25);

    const { result } = renderHook(() => useStickyFloating(sentinelRef, elementRef));

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });

  it("docks inside the scroll root it is given", async () => {
    const { sentinelRef, elementRef } = setup(40, 160, false);
    sentinelRef.current?.parentElement?.classList.add("drawer-content");

    const { result } = renderHook(() =>
      useStickyFloating(sentinelRef, elementRef, ".drawer-content"),
    );

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it("returns false outside the scroll root", async () => {
    const { sentinelRef, elementRef } = setup(40, 160, false);

    const { result } = renderHook(() => useStickyFloating(sentinelRef, elementRef));

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });
});
