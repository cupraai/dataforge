import { useLayoutEffect, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import {
  COLLAPSIBLE_LABEL_CLASS,
  toolbarNeedsCompact,
  type ToolbarRowWidths,
} from "@/features/gallery/lib/toolbarCompact";
import { useLatestRef } from "@/shared/hooks/useLatestRef";

function px(value: string): number {
  return parseFloat(value) || 0;
}

/** The element that draws `element`'s box: a tooltip's trigger span draws none of its own. */
function layoutBox(element: Element): Element {
  let box = element;
  while (getComputedStyle(box).display === "contents" && box.firstElementChild) {
    box = box.firstElementChild;
  }
  return box;
}

/**
 * How much wider the buttons are with their labels shown than with them hidden. A hidden label
 * keeps its text width as scrollWidth, and a compact button also tightens its gap and padding,
 * so the size's own spacing comes from `--button-gap` / `--button-padding` (registered lengths).
 */
function labelSavings(actions: HTMLElement): number {
  const buttons = new Set<HTMLElement>();
  for (const label of actions.querySelectorAll(`.${COLLAPSIBLE_LABEL_CLASS}`)) {
    if (label.parentElement) buttons.add(label.parentElement);
  }
  let total = 0;
  for (const button of buttons) {
    const style = getComputedStyle(button);
    const gap = px(style.columnGap);
    const fullGap = px(style.getPropertyValue("--button-gap")) || gap;
    const fullPadding = px(style.getPropertyValue("--button-padding")) || px(style.paddingLeft);
    const items = button.children.length;
    const labels = [...button.children].filter((child) =>
      child.classList.contains(COLLAPSIBLE_LABEL_CLASS),
    );
    const text = labels.reduce((sum, label) => sum + label.scrollWidth, 0);
    const full = text + Math.max(0, items - 1) * fullGap + 2 * fullPadding;
    const bare = Math.max(0, items - labels.length - 1) * gap + px(style.paddingLeft);
    total += full - bare - px(style.paddingRight);
  }
  return total;
}

function measureToolbarRow(toolbar: HTMLElement): ToolbarRowWidths | null {
  const actions = toolbar.querySelector<HTMLElement>(".toolbar__actions");
  const controls = toolbar.querySelector<HTMLElement>(".toolbar__controls");
  if (!actions || !controls) return null;

  // Below the stats breakpoint the stats take a row of their own; the rest shares the next.
  const stats = toolbar.querySelector<HTMLElement>(".toolbar__stats");
  const statsWidth =
    stats && getComputedStyle(stats).flexBasis !== "100%" ? stats.getBoundingClientRect().width : 0;
  const children = Array.from(controls.children, layoutBox);
  const first = children.at(0)?.getBoundingClientRect();
  const last = children.at(-1)?.getBoundingClientRect();
  const style = getComputedStyle(toolbar);

  return {
    row: toolbar.clientWidth - px(style.paddingLeft) - px(style.paddingRight),
    stats: statsWidth,
    actions: actions.getBoundingClientRect().width,
    labels: labelSavings(actions),
    controls: first && last ? last.right - first.left : 0,
    gap: px(style.columnGap),
  };
}

/** Whether the folder actions should drop their labels so the toolbar keeps to one row. */
export function useToolbarCompactMode(toolbarRef: RefObject<HTMLElement | null>): boolean {
  const [compact, setCompact] = useState(false);
  const compactRef = useLatestRef(compact);

  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;

    const decide = () => {
      const widths = measureToolbarRow(toolbar);
      return widths ? toolbarNeedsCompact(widths, compactRef.current) : compactRef.current;
    };
    // Commit inside the observer, or the wrapped row paints for a frame.
    const measure = () => {
      const next = decide();
      if (next !== compactRef.current) flushSync(() => setCompact(next));
    };
    // Watched boxes must not resize on the flip (ResizeObserver loop error).
    // So width comes from a zero-height probe; the actions are left to the mutation observer.
    const resizes = new ResizeObserver(measure);
    const observe = () => {
      resizes.observe(toolbar.querySelector(".toolbar__measure") ?? toolbar);
      toolbar
        .querySelectorAll(".toolbar__stats, .toolbar__controls > *")
        .forEach((element) => resizes.observe(layoutBox(element)));
    };
    const mutations = new MutationObserver(() => {
      observe();
      measure();
    });

    observe();
    // Inside the layout effect a plain update already lands before paint.
    setCompact(decide());
    mutations.observe(toolbar, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => {
      resizes.disconnect();
      mutations.disconnect();
    };
  }, [compactRef, toolbarRef]);

  return compact;
}
