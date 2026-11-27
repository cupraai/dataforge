import { useState, type HTMLAttributes, type RefObject } from "react";
import { readStored, writeStored } from "@/shared/lib/storage";

const STORAGE_KEY = "workspace-inspector-width";
const MIN_WIDTH = 320;
const MAX_WIDTH = 520;
const DEFAULT_WIDTH = 380;
const KEY_STEP = 20;

function clampWidth(width: number): number {
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width));
}

/** The docked inspector's remembered width, and the separator that drags or steps it. */
export function useInspectorWidth(panelRef: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(() => {
    const stored = Number(readStored(STORAGE_KEY));
    return stored >= MIN_WIDTH && stored <= MAX_WIDTH ? stored : DEFAULT_WIDTH;
  });

  const separatorProps: HTMLAttributes<HTMLDivElement> = {
    role: "separator",
    "aria-label": "Caption inspector width",
    "aria-orientation": "vertical",
    "aria-valuemin": MIN_WIDTH,
    "aria-valuemax": MAX_WIDTH,
    "aria-valuenow": width,
    tabIndex: 0,
    onKeyDown: (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const next = clampWidth(width + (event.key === "ArrowLeft" ? KEY_STEP : -KEY_STEP));
      setWidth(next);
      writeStored(STORAGE_KEY, String(next));
    },
    onPointerDown: (event) => event.currentTarget.setPointerCapture(event.pointerId),
    onPointerMove: (event) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      const right = panelRef.current?.getBoundingClientRect().right ?? window.innerWidth;
      setWidth(clampWidth(right - event.clientX));
    },
    onPointerUp: (event) => {
      event.currentTarget.releasePointerCapture(event.pointerId);
      writeStored(STORAGE_KEY, String(width));
    },
  };

  return { width, separatorProps };
}
