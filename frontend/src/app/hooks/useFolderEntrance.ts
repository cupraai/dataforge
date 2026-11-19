import { useLayoutEffect, type RefObject } from "react";
import {
  DURATION_BASE_MS,
  DURATION_MODERATE_MS,
  EASE_EMPHASIZED,
  EASE_STANDARD,
  prefersReducedMotion,
  STAGGER_MAX,
  STAGGER_STEP_MS,
} from "@/shared/lib/motion";

const CARD_SELECTOR = ".folder-card, .model-card, .video-project-card, .card-cell";

/**
 * Fades a folder's contents in when it opens, and lets every card in view rise, one after another
 * for the first few and together after that, so a long folder does not trickle in. Web Animations
 * rather than a keyed remount: the gallery keeps its state and scroll, and cards a virtualised row
 * mounts later while scrolling never animate.
 */
export function useFolderEntrance(contentRef: RefObject<HTMLElement | null>, folderKey: string) {
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || typeof content.animate !== "function" || prefersReducedMotion()) return;
    content.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: DURATION_BASE_MS,
      easing: EASE_STANDARD,
    });
    // A virtualised grid renders its rows a commit after measuring; they are there by the frame.
    const frame = requestAnimationFrame(() => {
      const bottom = window.innerHeight;
      const cards = [...content.querySelectorAll<HTMLElement>(CARD_SELECTOR)].filter((card) => {
        const box = card.getBoundingClientRect();
        return box.bottom > 0 && box.top < bottom;
      });
      cards.forEach((card, index) => {
        card.animate(
          [
            { opacity: 0, transform: "translateY(0.375rem)" },
            { opacity: 1, transform: "none" },
          ],
          {
            duration: DURATION_MODERATE_MS,
            delay: Math.min(index, STAGGER_MAX - 1) * STAGGER_STEP_MS,
            easing: EASE_EMPHASIZED,
            fill: "backwards",
          },
        );
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [contentRef, folderKey]);
}
