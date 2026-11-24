import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import {
  DURATION_MODERATE_MS,
  EASE_STANDARD,
  EXIT_FALLBACK_MS,
  prefersReducedMotion,
} from "@/shared/lib/motion";

const MOTION_ID = "clamped-grid";

type Direction = "open" | "close";

interface ClampedGridMotion {
  /** True while a collapse shrinks the grid: render every item until it ends. */
  closing: boolean;
  /** Call in the toggle handler, before the expanded state changes. */
  begin: (direction: Direction) => void;
}

function stop(grid: HTMLElement) {
  for (const running of grid.getAnimations({ subtree: true })) {
    if (running.id === MOTION_ID) running.cancel();
  }
  grid.style.overflow = "";
}

/**
 * Grows a clamped grid open and shrinks it closed, instead of moving what follows in one jump.
 * Columns auto-fill, so the clamp can end mid-row and the extra items cannot sit in a strip of
 * their own: the grid's height animates, and the extra items fade. A collapse keeps them rendered
 * until the shrink ends, so they are clipped away rather than cut while still on screen.
 */
export function useClampedGridMotion(
  gridRef: RefObject<HTMLElement | null>,
  itemSelector: string,
  visibleCount: number,
): ClampedGridMotion {
  const [closing, setClosing] = useState(false);
  const [run, setRun] = useState(0);
  const pending = useRef<{ direction: Direction; fromPx: number } | null>(null);
  const active = useRef<Direction | null>(null);
  const finishTimer = useRef<number | undefined>(undefined);

  const begin = (direction: Direction) => {
    const grid = gridRef.current;
    window.clearTimeout(finishTimer.current);
    pending.current = null;
    active.current = null;
    if (!grid || typeof grid.animate !== "function" || prefersReducedMotion()) {
      setClosing(false);
      return;
    }
    // The drawn height, so a toggle mid-motion turns back from where the grid is.
    const fromPx = grid.getBoundingClientRect().height;
    stop(grid);
    pending.current = { direction, fromPx };
    setClosing(direction === "close");
    setRun((count) => count + 1);
  };

  useLayoutEffect(() => {
    const grid = gridRef.current;
    const motion = pending.current;
    pending.current = null;
    if (!grid || !motion) return;

    const items = [...grid.querySelectorAll<HTMLElement>(itemSelector)];
    const lastKept = items[visibleCount - 1];
    const gridTop = grid.getBoundingClientRect().top;
    const toPx =
      motion.direction === "open" || !lastKept
        ? grid.getBoundingClientRect().height
        : lastKept.getBoundingClientRect().bottom - gridTop;

    const options: KeyframeAnimationOptions = {
      id: MOTION_ID,
      duration: DURATION_MODERATE_MS,
      easing: EASE_STANDARD,
      // Held at the end until the extra items unmount in the same commit that cancels it.
      fill: "forwards",
    };
    active.current = motion.direction;
    grid.style.overflow = "hidden";
    const height = grid.animate(
      [{ height: `${motion.fromPx}px` }, { height: `${toPx}px` }],
      options,
    );
    const fade = motion.direction === "open" ? [0, 1] : [1, 0];
    for (const item of items.slice(visibleCount)) {
      item.animate([{ opacity: fade[0] }, { opacity: fade[1] }], options);
    }

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(finishTimer.current);
      if (motion.direction === "close") {
        setClosing(false);
      } else {
        active.current = null;
        stop(grid);
      }
    };
    // A cancelled run rejects; the toggle that cancelled it starts its own.
    height.finished.then(finish, () => {
      done = true;
    });
    // A hidden tab renders no frames, so `finished` may never come.
    finishTimer.current = window.setTimeout(finish, DURATION_MODERATE_MS + EXIT_FALLBACK_MS);
  }, [gridRef, itemSelector, visibleCount, run]);

  // The collapse ends: the extra items are gone in this commit, so release the held height. An
  // expand that turned it back runs on and is left alone.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (closing || active.current !== "close" || !grid) return;
    active.current = null;
    stop(grid);
  }, [closing, gridRef]);

  useLayoutEffect(() => () => window.clearTimeout(finishTimer.current), []);

  return { closing, begin };
}
