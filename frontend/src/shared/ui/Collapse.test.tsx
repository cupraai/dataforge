import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { Collapse } from "./Collapse";

function renderCollapse(open: boolean) {
  const view = render(
    <Collapse open={open} role="status">
      Busy
    </Collapse>,
  );
  const rerender = (next: boolean) =>
    view.rerender(
      <Collapse open={next} role="status">
        Busy
      </Collapse>,
    );
  return { rerender };
}

const strip = () => screen.getByRole("status").closest(".collapse")!;

describe("Collapse", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing while closed", () => {
    renderCollapse(false);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shrinks closed before it leaves", () => {
    const { rerender } = renderCollapse(true);
    expect(strip()).not.toHaveClass("collapse--exit");

    rerender(false);
    expect(strip()).toHaveClass("collapse--exit");
    expect(screen.getByRole("status")).toHaveTextContent("Busy");

    fireEvent.animationEnd(strip());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("ignores a child's animation ending", () => {
    const { rerender } = renderCollapse(true);
    rerender(false);
    fireEvent.animationEnd(screen.getByRole("status"));
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("leaves without an animation end, as in a hidden tab", () => {
    vi.useFakeTimers();
    const { rerender } = renderCollapse(true);
    rerender(false);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("stays when reopened mid-exit", () => {
    vi.useFakeTimers();
    const { rerender } = renderCollapse(true);
    rerender(false);
    rerender(true);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(strip()).not.toHaveClass("collapse--exit");
  });
});
