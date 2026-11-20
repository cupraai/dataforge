import { useLayoutEffect, useRef, useState, type RefObject } from "react";

/** Children the element wrapped below its first line, which a fixed one-line height hides. */
function countWrapped(element: HTMLElement): number {
  const children = Array.from(element.children) as HTMLElement[];
  const firstTop = children[0]?.offsetTop ?? 0;
  return children.filter((child) => child.offsetTop > firstTop).length;
}

/**
 * Children of a one-line wrapping row out of sight, recounted for new `contents`.
 * The "+N more" can wrap one more child; that settles on the next notification only while a
 * larger N never renders narrower, so its digits must be tabular.
 */
export function useWrappedCount(ref: RefObject<HTMLElement | null>, contents: unknown): number {
  const [wrapped, setWrapped] = useState(0);
  // Only real changes: every card mounts this, so extra renders repaint the grid.
  const lastRef = useRef(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const count = () => {
      const next = countWrapped(element);
      if (next === lastRef.current) return;
      lastRef.current = next;
      setWrapped(next);
    };
    count();
    const observer = new ResizeObserver(count);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, contents]);

  return wrapped;
}
