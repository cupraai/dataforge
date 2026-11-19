import { useLayoutEffect, useRef, type RefObject } from "react";
import { DURATION_MODERATE_MS, EASE_EMPHASIZED, prefersReducedMotion } from "@/shared/lib/motion";

/** How far the new item travels in, toward where it came from. */
const TRAVEL_REM = 1.25;

/** 1 when paging forward, -1 back; stepping over either end of the list keeps the direction. */
export function pagingDirection(from: number, to: number, count: number): 1 | -1 {
  if (count > 2 && from === count - 1 && to === 0) return 1;
  if (count > 2 && from === 0 && to === count - 1) return -1;
  return to >= from ? 1 : -1;
}

/**
 * Slides a newly paged item into the stage from the side it was paged toward. Everything in the
 * stage moves but the nav buttons, which stay put so repeated clicks land on them.
 */
export function useStagePaging(
  stageRef: RefObject<HTMLElement | null>,
  path: string | undefined,
  index: number,
  count: number,
  enabled: boolean,
) {
  const shown = useRef<{ path: string | undefined; index: number } | null>(null);

  useLayoutEffect(() => {
    const before = shown.current;
    shown.current = { path, index };
    const stage = stageRef.current;
    if (!before || before.path === path || !path || !enabled || !stage) return;
    if (typeof stage.animate !== "function" || prefersReducedMotion()) return;

    const direction = pagingDirection(before.index, index, count);
    const media = stage.querySelectorAll<HTMLElement>(":scope > :not(.gallery-item-dialog__nav)");
    for (const element of media) {
      element.animate(
        [
          { opacity: 0, transform: `translateX(${direction * TRAVEL_REM}rem)` },
          { opacity: 1, transform: "none" },
        ],
        { duration: DURATION_MODERATE_MS, easing: EASE_EMPHASIZED },
      );
    }
  }, [stageRef, path, index, count, enabled]);
}
