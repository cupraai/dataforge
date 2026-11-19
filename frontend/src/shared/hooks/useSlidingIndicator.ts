import { useLayoutEffect, type RefObject } from "react";
import { useLatestRef } from "@/shared/hooks/useLatestRef";

/**
 * Slides one indicator to a group's chosen item instead of each item painting its own fill. The
 * item's box lands on the root as `--indicator-x/y/w/h` (offsets, so a pressed item's `scale`
 * cannot skew it), with `data-indicator="ready"` once placed. Until then, or with nothing chosen,
 * the item keeps its own fill: what a test or a tab that renders no frames sees.
 */
export function useSlidingIndicator(
  rootRef: RefObject<HTMLElement | null>,
  findSelected: (root: HTMLElement) => HTMLElement | null,
  selectedKey: unknown,
): void {
  const find = useLatestRef(findSelected);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let observed: HTMLElement | null = null;
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => place());

    function place() {
      if (!root) return;
      const item = find.current(root);
      if (item !== observed) {
        if (observed) observer?.unobserve(observed);
        if (item) observer?.observe(item);
        observed = item;
      }
      if (!item || item.offsetWidth === 0) {
        delete root.dataset.indicator;
        return;
      }
      root.style.setProperty("--indicator-x", `${item.offsetLeft}px`);
      root.style.setProperty("--indicator-y", `${item.offsetTop}px`);
      root.style.setProperty("--indicator-w", `${item.offsetWidth}px`);
      root.style.setProperty("--indicator-h", `${item.offsetHeight}px`);
      root.dataset.indicator = "ready";
    }

    place();
    observer?.observe(root);
    return () => observer?.disconnect();
  }, [find, rootRef, selectedKey]);
}
