import { EXIT_FALLBACK_MS, prefersReducedMotion } from "./motion";

/** Past this many elements, copying the dialog costs more than its fade is worth. */
const MAX_ELEMENTS = 4000;

/**
 * Takes an inert copy of a closing dialog while it is still laid out, and returns a function that
 * plays the copy's exit. Owners close dialogs by unmounting them, on cancel and on completion
 * alike; animating a copy lets every close fade without keeping the real dialog, its scroll lock
 * or its focus trap alive. Returns null when there is nothing to play.
 */
export function snapshotDialogExit(dialog: HTMLDialogElement): (() => void) | null {
  if (!dialog.open || prefersReducedMotion() || document.visibilityState === "hidden") return null;
  const host = document.createElement("div");
  if (typeof host.showPopover !== "function") return null;
  const originals = dialog.getElementsByTagName("*");
  if (originals.length > MAX_ELEMENTS) return null;

  const copy = asPlainSurface(dialog.cloneNode(true) as HTMLDialogElement);
  carryLiveState(dialog, copy);
  for (const element of [copy, ...copy.querySelectorAll("[id], [name], [autofocus]")]) {
    // Duplicates would steal label targets, radio groups and focus from the live document.
    element.removeAttribute("id");
    element.removeAttribute("name");
    element.removeAttribute("autofocus");
  }
  const panel = copy.querySelector<HTMLElement>(":scope > .dialog-panel");
  if (!panel) return null;
  panel.classList.remove("dialog-panel--enter");
  panel.classList.add("dialog-panel--exit");
  copy.querySelector(":scope > .dialog-backdrop")?.classList.add("dialog-backdrop--exit");

  host.className = "dialog-exit-ghost";
  host.popover = "manual";
  host.inert = true;
  host.setAttribute("aria-hidden", "true");
  host.append(copy);

  return () => {
    let timer = 0;
    const remove = () => {
      window.clearTimeout(timer);
      host.remove();
    };
    panel.addEventListener("animationend", (event) => {
      if (event.target === panel) remove();
    });
    timer = window.setTimeout(remove, EXIT_FALLBACK_MS);
    document.body.append(host);
    // The top layer stacks it over a parent dialog that stays open, without moving focus.
    host.showPopover();
    restoreScroll(host);
  };
}

/**
 * The copy as a `<div>`: an open `<dialog>` in the document, even an inert one, still takes part
 * in Escape handling and matches `dialog` queries. Classes and attributes carry over, `open` too,
 * which the surface's styles read.
 */
function asPlainSurface(dialog: HTMLDialogElement): HTMLElement {
  const surface = document.createElement("div");
  for (const { name, value } of dialog.attributes) {
    if (name !== "role" && !name.startsWith("aria-")) surface.setAttribute(name, value);
  }
  surface.append(...dialog.childNodes);
  return surface;
}

/** What `cloneNode` leaves behind: scroll offsets and drawn pixels. */
function carryLiveState(source: HTMLElement, copy: HTMLElement) {
  const sources = [source, ...source.getElementsByTagName("*")];
  const copies = [copy, ...copy.getElementsByTagName("*")];
  sources.forEach((element, index) => {
    const target = copies[index];
    if (element.scrollTop || element.scrollLeft) {
      // Applied once the copy is laid out; a detached element cannot scroll.
      target.setAttribute("data-ghost-scroll", `${element.scrollLeft},${element.scrollTop}`);
    }
    if (element instanceof HTMLCanvasElement && target instanceof HTMLCanvasElement) {
      copyPixels(element, target);
    } else if (element instanceof HTMLVideoElement && element.readyState >= 2) {
      const frame = document.createElement("canvas");
      frame.className = element.className;
      frame.width = element.videoWidth;
      frame.height = element.videoHeight;
      copyPixels(element, frame);
      target.replaceWith(frame);
    }
  });
}

function copyPixels(source: CanvasImageSource, target: HTMLCanvasElement) {
  try {
    target.getContext("2d")?.drawImage(source, 0, 0, target.width, target.height);
  } catch {
    // A tainted or lost context leaves the copy blank for its brief fade.
  }
}

function restoreScroll(host: HTMLElement) {
  for (const element of host.querySelectorAll<HTMLElement>("[data-ghost-scroll]")) {
    const [left, top] = (element.dataset.ghostScroll ?? "0,0").split(",").map(Number);
    element.scrollLeft = left;
    element.scrollTop = top;
  }
}
