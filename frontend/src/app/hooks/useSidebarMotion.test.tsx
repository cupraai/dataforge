import { useRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSidebarMotion } from "./useSidebarMotion";

function Sidebar({ hidden, overlay = false }: { hidden: boolean; overlay?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const beforeToggle = useSidebarMotion(ref, hidden);
  return (
    <div className="app">
      <button type="button" onClick={beforeToggle}>
        Toggle
      </button>
      <aside
        ref={ref}
        className={[
          "workspace-sidebar",
          hidden && "workspace-sidebar--collapsed",
          overlay && "workspace-sidebar--overlay",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {overlay && <button type="button" className="workspace-sidebar__backdrop" />}
        <div className="workspace-sidebar__panel">
          <div className="workspace-sidebar__heading">
            {!hidden && <strong className="workspace-sidebar__brand">DataForge</strong>}
          </div>
          <button type="button" id="settings">
            Settings
          </button>
          <div className="workspace-sidebar__scroll" />
        </div>
      </aside>
      <div className="app-nav__inner">
        <nav className="breadcrumbs">
          <ol className="breadcrumbs__list" />
          <div className="breadcrumbs__actions" />
        </nav>
      </div>
      <main className="main">
        <div className="main__inner" />
      </main>
    </div>
  );
}

describe("useSidebarMotion", () => {
  let animate: ReturnType<typeof vi.fn<Element["animate"]>>;
  let finish: () => void;
  /** Where the gallery's content lies: the rail's edge, or the open column's. */
  let contentLeft = 48;

  beforeEach(() => {
    contentLeft = 48;
    let resolve = () => {};
    const finished = new Promise<void>((done) => {
      resolve = done;
    });
    finish = resolve;
    animate = vi.fn<Element["animate"]>(() => ({ finished }) as unknown as Animation);
    // jsdom has no Web Animations or layout; the motion needs only these.
    Element.prototype.animate = animate;
    Element.prototype.getAnimations = () => [];
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
      // The bar stretches from the content's edge to a fixed right edge, where its actions sit.
      if (this.classList.contains("breadcrumbs")) {
        return DOMRect.fromRect({ x: contentLeft, width: 1000 - contentLeft, height: 30 });
      }
      if (this.classList.contains("breadcrumbs__actions")) {
        return DOMRect.fromRect({ x: 900, width: 100, height: 30 });
      }
      const follows = ["main__inner", "breadcrumbs__list"].some((name) =>
        this.classList.contains(name),
      );
      return DOMRect.fromRect({ x: follows ? contentLeft : 0, width: 100, height: 100 });
    });
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.classList.contains("workspace-sidebar--collapsed") ? 48 : 232;
    });
  });

  afterEach(() => {
    delete (Element.prototype as Partial<Element>).animate;
    delete (Element.prototype as Partial<Element>).getAnimations;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const toggle = (next: () => void, left: number) => {
    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    contentLeft = left;
    next();
  };
  const callsOn = (element: Element | null) =>
    animate.mock.calls.filter((_, index) => animate.mock.contexts[index] === element);
  const transforms = (element: Element | null) =>
    callsOn(element).map(([frames]) => (frames as Keyframe[]).map((frame) => frame.transform));

  it("lets the contents rise in and glides the gallery from where it was", () => {
    contentLeft = 48;
    const { container, rerender } = render(<Sidebar hidden />);
    toggle(() => rerender(<Sidebar hidden={false} />), 232);

    expect(transforms(container.querySelector(".main__inner"))).toEqual([
      ["translateX(-184px)", "translateX(0px)"],
    ]);
    const content = ["workspace-sidebar__brand", "settings", "workspace-sidebar__scroll"].map(
      (key) => container.querySelector(`.${key}, #${key}`),
    );
    for (const element of content) expect(callsOn(element)).toHaveLength(1);
    // The column itself snaps: nothing animates its width or its surface.
    expect(callsOn(container.querySelector("aside"))).toHaveLength(0);
  });

  it("glides a stretched bar's left-hand pieces and leaves its right-aligned ones still", () => {
    const { container, rerender } = render(<Sidebar hidden />);
    toggle(() => rerender(<Sidebar hidden={false} />), 232);

    expect(transforms(container.querySelector(".breadcrumbs__list"))).toEqual([
      ["translateX(-184px)", "translateX(0px)"],
    ]);
    expect(callsOn(container.querySelector(".breadcrumbs"))).toHaveLength(0);
    expect(callsOn(container.querySelector(".breadcrumbs__actions"))).toHaveLength(0);
  });

  it("slides a floating panel out of the rail and fades its backdrop in", () => {
    const { container, rerender } = render(<Sidebar hidden />);
    toggle(() => rerender(<Sidebar hidden={false} overlay />), 48);

    expect(transforms(container.querySelector(".workspace-sidebar__panel"))[0]).toEqual([
      "translateX(-184px)",
      "translateX(0px)",
    ]);
    expect(callsOn(container.querySelector(".workspace-sidebar__backdrop"))).toHaveLength(1);
    // The gallery under a floating panel never moved.
    expect(callsOn(container.querySelector(".main__inner"))).toHaveLength(0);
  });

  it("slides an inert copy into the rail beside the gallery, then removes it", async () => {
    contentLeft = 232;
    const { container, rerender } = render(<Sidebar hidden={false} />);
    toggle(() => rerender(<Sidebar hidden />), 48);

    const ghost = container.querySelector<HTMLElement>(".workspace-sidebar--ghost")!;
    expect(ghost.parentElement).toBe(container.querySelector("aside"));
    expect(ghost.inert).toBe(true);
    expect(ghost).toHaveAttribute("aria-hidden", "true");
    expect(ghost.querySelector("[id]")).toBeNull();
    expect(ghost).toHaveTextContent("DataForge");
    // The copy's edge and the gallery's content travel the same way together.
    expect(transforms(ghost)[0]).toEqual(["translateX(0px)", "translateX(-184px)"]);
    expect(transforms(container.querySelector(".main__inner"))).toEqual([
      ["translateX(184px)", "translateX(0px)"],
    ]);

    await act(async () => {
      finish();
      await Promise.resolve();
    });
    expect(container.querySelector(".workspace-sidebar--ghost")).toBeNull();
  });

  it("stays still when the layout changes on its own, and under reduced motion", () => {
    const { container, rerender } = render(<Sidebar hidden />);
    // A resize that opens it, with no toggle first.
    rerender(<Sidebar hidden={false} />);
    vi.stubGlobal("matchMedia", () => ({ matches: true }) as MediaQueryList);
    toggle(() => rerender(<Sidebar hidden />), 48);
    toggle(() => rerender(<Sidebar hidden={false} />), 232);

    expect(animate).not.toHaveBeenCalled();
    expect(container.querySelector(".workspace-sidebar--ghost")).toBeNull();
  });
});
