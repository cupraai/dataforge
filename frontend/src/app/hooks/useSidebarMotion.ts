import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import {
  DURATION_BASE_MS,
  DURATION_FAST_MS,
  DURATION_MODERATE_MS,
  EASE_EMPHASIZED,
  EXIT_FALLBACK_MS,
  prefersReducedMotion,
  STAGGER_MAX,
  STAGGER_STEP_MS,
} from "@/shared/lib/motion";

/** The rail's track in `layout/_workspace.scss`; the sidebar opens from and closes into it. */
const RAIL_PX = 48;
const CONTENT_SELECTOR =
  ".workspace-sidebar__brand, .workspace-sidebar__panel > :not(.workspace-sidebar__heading)";
/**
 * What the column's width moves: the header rows, the note and the gallery's content, never the
 * boxes drawing a background, which would leave a gap. A header row that stretches to the new
 * width hands the glide down to its pieces, so right-aligned controls stay where they are.
 */
const HEADER_SELECTOR = ".app-nav__inner > :not(.toolbar), .toolbar > :not(.toolbar__measure)";
/** These move as one piece: the gallery lays out again at its new width. */
const BLOCK_SELECTOR = ".main-note > *, .main__inner";
/** How deep a stretched header row is followed into its pieces. */
const HEADER_DEPTH = 4;
const TIMING = { duration: DURATION_MODERATE_MS, easing: EASE_EMPHASIZED };
const GLIDE_ID = "sidebar-glide";

interface Edges {
  left: number;
  right: number;
  /** No box of its own, such as a `display: contents` wrapper. */
  empty: boolean;
}

interface Movers {
  edges: Map<HTMLElement, Edges>;
  headers: HTMLElement[];
  blocks: HTMLElement[];
}

function canAnimate(element: HTMLElement): boolean {
  return (
    typeof element.animate === "function" &&
    !prefersReducedMotion() &&
    document.visibilityState !== "hidden"
  );
}

function isFloating(aside: HTMLElement): boolean {
  return aside.classList.contains("workspace-sidebar--overlay");
}

function panelOf(aside: HTMLElement): HTMLElement | null {
  return aside.querySelector<HTMLElement>(":scope > .workspace-sidebar__panel");
}

function edgesOf(element: HTMLElement): Edges {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, right: rect.right, empty: rect.width === 0 && rect.height === 0 };
}

function childElements(element: HTMLElement): HTMLElement[] {
  return [...element.children].filter((child) => child instanceof HTMLElement);
}

function measureMovers(aside: HTMLElement): Movers {
  const root = aside.parentElement;
  const headers = root ? [...root.querySelectorAll<HTMLElement>(HEADER_SELECTOR)] : [];
  const blocks = root ? [...root.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)] : [];
  const edges = new Map<HTMLElement, Edges>();
  const record = (element: HTMLElement, depth: number) => {
    edges.set(element, edgesOf(element));
    if (depth < HEADER_DEPTH) for (const child of childElements(element)) record(child, depth + 1);
  };
  headers.forEach((header) => record(header, 0));
  blocks.forEach((block) => edges.set(block, edgesOf(block)));
  return { edges, headers, blocks };
}

function slide(element: Element, fromPx: number, toPx: number, options: KeyframeAnimationOptions) {
  return element.animate(
    [{ transform: `translateX(${fromPx}px)` }, { transform: `translateX(${toPx}px)` }],
    options,
  );
}

/** Slides whatever the width change moved from where it was, so the layout glides, not jumps. */
function glide({ edges, headers, blocks }: Movers) {
  const elements = [...edges.keys()].filter((element) => element.isConnected);
  // A toggle mid-glide starts from where it was drawn, and measures where it now lies.
  for (const element of elements) {
    for (const running of element.getAnimations()) {
      if (running.id === GLIDE_ID) running.cancel();
    }
  }
  const now = new Map(elements.map((element) => [element, edgesOf(element)]));
  const shift = (element: HTMLElement, distance: number) => {
    if (Math.abs(distance) >= 1) slide(element, distance, 0, { ...TIMING, id: GLIDE_ID });
  };
  for (const block of blocks) {
    const before = edges.get(block);
    const after = now.get(block);
    if (before && after) shift(block, before.left - after.left);
  }
  const follow = (element: HTMLElement) => {
    const before = edges.get(element);
    const after = now.get(element);
    if (!before || !after) return;
    const left = before.left - after.left;
    // Moved as one piece, or not at all: whatever it holds travels with it.
    if (!before.empty && Math.abs(left - (before.right - after.right)) < 1) {
      shift(element, left);
      return;
    }
    // Stretched, or no box of its own: its pieces may each have moved differently.
    childElements(element).forEach(follow);
  };
  headers.forEach(follow);
}

function open(aside: HTMLElement) {
  const travel = aside.offsetWidth - RAIL_PX;
  if (isFloating(aside)) {
    const panel = panelOf(aside);
    if (panel) slide(panel, -(panel.offsetWidth - RAIL_PX), 0, TIMING);
    aside
      .querySelector(":scope > .workspace-sidebar__backdrop")
      ?.animate([{ opacity: 0 }, { opacity: 1 }], TIMING);
  }
  const content = [...aside.querySelectorAll<HTMLElement>(CONTENT_SELECTOR)];
  content.forEach((element, index) => {
    element.animate(
      [
        { opacity: 0, transform: `translateX(${-Math.min(travel, 24)}px)` },
        { opacity: 1, transform: "none" },
      ],
      {
        ...TIMING,
        delay: Math.min(index, STAGGER_MAX - 1) * STAGGER_STEP_MS,
        fill: "backwards",
      },
    );
  });
}

/** An inert copy of the open sidebar, laid over the rail the real one is about to become. */
function copyOpen(aside: HTMLElement): HTMLElement {
  const ghost = aside.cloneNode(true) as HTMLElement;
  for (const element of [ghost, ...ghost.querySelectorAll("[id], [name], [autofocus]")]) {
    element.removeAttribute("id");
    element.removeAttribute("name");
    element.removeAttribute("autofocus");
  }
  ghost.classList.add("workspace-sidebar--ghost");
  ghost.inert = true;
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.width = `${aside.offsetWidth}px`;
  aside.append(ghost);
  // Removed even if the close never renders or its animation never ends.
  window.setTimeout(() => ghost.remove(), DURATION_MODERATE_MS + EXIT_FALLBACK_MS);
  return ghost;
}

/**
 * Slides the copy into the rail, its contents fading first and its surface last, handing over
 * to the rail's own icons beneath it.
 */
function close(ghost: HTMLElement) {
  const floating = isFloating(ghost);
  const sliding = (floating && panelOf(ghost)) || ghost;
  const travel = sliding.offsetWidth - RAIL_PX;
  const closing = slide(sliding, 0, -travel, { ...TIMING, fill: "forwards" });
  panelOf(ghost)
    ?.querySelectorAll(":scope > *")
    .forEach((element) =>
      element.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: DURATION_FAST_MS,
        easing: EASE_EMPHASIZED,
        fill: "forwards",
      }),
    );
  ghost.animate([{ opacity: 1 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }], {
    ...TIMING,
    fill: "forwards",
  });
  if (floating) {
    ghost
      .querySelector(":scope > .workspace-sidebar__backdrop")
      ?.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: DURATION_BASE_MS,
        easing: EASE_EMPHASIZED,
        fill: "forwards",
      });
  }
  closing.finished.catch(() => {}).finally(() => ghost.remove());
}

/**
 * Animates the sidebar opening from and closing into its rail, without animating its width: the
 * width snaps, so the gallery lays out once, and everything else moves by transform. Call the
 * returned function just before the user's own toggle changes `hidden`; layout changes, such as
 * a resize, stay instant.
 */
export function useSidebarMotion(asideRef: RefObject<HTMLElement | null>, hidden: boolean) {
  const pending = useRef<{ movers: Movers; ghost: HTMLElement | null } | null>(null);

  useLayoutEffect(() => {
    const toggle = pending.current;
    pending.current = null;
    const aside = asideRef.current;
    if (!toggle || !aside) return;
    glide(toggle.movers);
    if (toggle.ghost) close(toggle.ghost);
    else if (!hidden) open(aside);
  }, [asideRef, hidden]);

  return useCallback(() => {
    const aside = asideRef.current;
    if (!aside || !canAnimate(aside)) return;
    // Measured and copied now, while the layout is still the one being left.
    pending.current = { movers: measureMovers(aside), ghost: hidden ? null : copyOpen(aside) };
  }, [asideRef, hidden]);
}
