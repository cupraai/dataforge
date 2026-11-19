/** Mirrors of the `--duration-*` tokens in `abstracts/_variables.scss`, for timers that unmount. */
export const DURATION_INSTANT_MS = 100;
export const DURATION_FAST_MS = 150;
export const DURATION_BASE_MS = 200;
export const DURATION_MODERATE_MS = 260;
export const EASE_STANDARD = "cubic-bezier(0.2, 0, 0, 1)";
export const EASE_EMPHASIZED = "cubic-bezier(0.22, 1, 0.36, 1)";
export const EASE_EXIT = "cubic-bezier(0.4, 0, 1, 1)";
/** One step of a staggered entrance, and the most steps any list staggers. */
export const STAGGER_STEP_MS = 18;
export const STAGGER_MAX = 12;

/** Backstop if `animationend` never fires, such as in a hidden tab that renders no frames. */
export const EXIT_FALLBACK_MS = 400;

/** The OS "reduce motion" setting; read per call so a change applies without a reload. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** Smooth scrolling unless the user asked for less motion. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}
