import { useLayoutEffect, useRef } from "react";

interface Anchor {
  path: string;
  top: number;
  layoutKey: string;
}

function scrollBy(element: HTMLElement, delta: number): void {
  element.scrollTop += delta;
}

/**
 * Keeps the inspected card in place on reflow by scrolling before paint.
 * `topOf` is read after commit; only a `layoutKey` change scrolls.
 */
export function useInspectedCardAnchor(
  scrollElement: HTMLElement | null,
  inspectedPath: string | null | undefined,
  layoutKey: string,
  topOf: (path: string) => number | null,
): void {
  const anchorRef = useRef<Anchor | null>(null);

  // Runs after every commit: the card's top can change without any argument changing.
  useLayoutEffect(() => {
    const previous = anchorRef.current;
    // The path clears a commit before the gallery widens, so the card stays the anchor.
    const path = inspectedPath || previous?.path;
    const top = path ? topOf(path) : null;
    const reflowed = previous !== null && previous.layoutKey !== layoutKey;
    anchorRef.current =
      path && top !== null && (inspectedPath || !reflowed) ? { path, top, layoutKey } : null;

    if (!scrollElement || !previous || !reflowed || top === null) return;
    if (previous.path !== path) return;
    if (top !== previous.top) scrollBy(scrollElement, top - previous.top);
  });
}
