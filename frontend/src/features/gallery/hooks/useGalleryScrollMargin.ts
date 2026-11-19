import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { getAppScrollElement } from "@/shared/lib/appScroll";

function measureScrollMargin(list: HTMLElement, scrollElement: HTMLElement): number {
  return (
    list.getBoundingClientRect().top -
    scrollElement.getBoundingClientRect().top +
    scrollElement.scrollTop
  );
}

export function useGalleryScrollMargin(
  listRef: RefObject<HTMLDivElement | null>,
  deps: readonly unknown[],
): { scrollElement: HTMLElement | null; scrollMargin: number } {
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const remeasureRef = useRef<(() => void) | null>(null);

  // One observer for life; recreating it mid-resize causes the ResizeObserver loop error.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const main = getAppScrollElement() ?? list.closest("main");
    setScrollElement(main);
    if (!main) return;

    const updateScrollMargin = () => {
      setScrollMargin(measureScrollMargin(list, main));
    };
    remeasureRef.current = updateScrollMargin;

    updateScrollMargin();

    const resizeObserver = new ResizeObserver(updateScrollMargin);
    resizeObserver.observe(main);
    resizeObserver.observe(list);

    window.addEventListener("resize", updateScrollMargin);
    return () => {
      remeasureRef.current = null;
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateScrollMargin);
    };
  }, [listRef]);

  useLayoutEffect(() => {
    remeasureRef.current?.();
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- caller controls when layout remeasures
  }, deps);

  return { scrollElement, scrollMargin };
}
