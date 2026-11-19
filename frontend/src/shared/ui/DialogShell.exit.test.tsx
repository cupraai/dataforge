import { StrictMode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetScrollLockManagerForTests } from "@/shared/hooks/scrollLockManager";
import { DialogShell } from "./DialogShell";

type ShellProps = Partial<Parameters<typeof DialogShell>[0]>;

function renderShell(props: ShellProps = {}) {
  return render(
    <StrictMode>
      <DialogShell block="test-dialog" label="Test dialog" onClose={vi.fn<() => void>()} {...props}>
        <ul className="test-dialog__list">
          <li>
            <input name="choice" type="radio" id="choice" defaultChecked aria-label="Choice" />
          </li>
        </ul>
      </DialogShell>
    </StrictMode>,
  );
}

const ghosts = () => document.querySelectorAll<HTMLElement>(".dialog-exit-ghost");

/** Lets the microtask that tells a real unmount from StrictMode's rehearsal run. */
const settle = () => Promise.resolve();

describe("DialogShell exit copy", () => {
  let showPopover: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    showPopover = vi.fn<() => void>();
    // jsdom has no popover API; the copy needs only the call.
    HTMLElement.prototype.showPopover = showPopover;
  });

  afterEach(() => {
    delete (HTMLElement.prototype as Partial<HTMLElement>).showPopover;
    for (const ghost of ghosts()) ghost.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetScrollLockManagerForTests();
  });

  it("plays an inert copy of the dialog when it unmounts", async () => {
    const { unmount } = renderShell();
    await settle();
    // StrictMode's rehearsal unmount on mount leaves no copy behind.
    expect(ghosts()).toHaveLength(0);

    unmount();
    await settle();

    const [ghost] = ghosts();
    expect(ghost).toBeDefined();
    expect(showPopover).toHaveBeenCalledTimes(1);
    expect(ghost.inert).toBe(true);
    expect(ghost).toHaveAttribute("aria-hidden", "true");
    expect(ghost.querySelector(".dialog-panel")).toHaveClass("dialog-panel--exit");
    expect(ghost.querySelector(".dialog-panel")).not.toHaveClass("dialog-panel--enter");
    expect(ghost.querySelector(".dialog-backdrop")).toHaveClass("dialog-backdrop--exit");
    // Duplicate ids and radio names would interfere with the live document.
    expect(ghost.querySelector("[id], [name]")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("removes the copy when its panel finishes animating", async () => {
    const { unmount } = renderShell();
    unmount();
    await settle();
    const [ghost] = ghosts();

    fireEvent.animationEnd(ghost.querySelector(".test-dialog__list") as HTMLElement);
    expect(ghost.isConnected).toBe(true);
    fireEvent.animationEnd(ghost.querySelector(".dialog-panel") as HTMLElement);
    expect(ghost.isConnected).toBe(false);
  });

  it("removes the copy when the animation never ends", async () => {
    vi.useFakeTimers();
    const { unmount } = renderShell();
    unmount();
    await settle();
    expect(ghosts()).toHaveLength(1);

    vi.advanceTimersByTime(400);
    expect(ghosts()).toHaveLength(0);
  });

  it("plays nothing for reduced motion, a dialog without an entrance or an owned exit", async () => {
    for (const props of [
      { enterAnimation: "none" },
      { onExited: vi.fn<() => void>() },
    ] as ShellProps[]) {
      renderShell(props).unmount();
    }
    vi.stubGlobal(
      "matchMedia",
      (query: string) => ({ matches: query.includes("reduce") }) as MediaQueryList,
    );
    renderShell().unmount();
    await settle();

    expect(ghosts()).toHaveLength(0);
    expect(showPopover).not.toHaveBeenCalled();
  });

  it("plays nothing where the browser lacks popovers", async () => {
    delete (HTMLElement.prototype as Partial<HTMLElement>).showPopover;
    renderShell().unmount();
    await settle();
    expect(ghosts()).toHaveLength(0);
  });
});
