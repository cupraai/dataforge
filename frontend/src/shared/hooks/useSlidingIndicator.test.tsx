import { useRef } from "react";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSlidingIndicator } from "./useSlidingIndicator";

function Group({ selected }: { selected: string | null }) {
  const rootRef = useRef<HTMLDivElement>(null);
  useSlidingIndicator(
    rootRef,
    (root) => root.querySelector<HTMLElement>("[data-selected]"),
    selected,
  );
  return (
    <div ref={rootRef} data-testid="group">
      {["a", "b"].map((id) => (
        <span key={id} data-id={id} data-selected={id === selected || undefined} />
      ))}
    </div>
  );
}

/** jsdom lays nothing out; give each item a box from its position in the row. */
function layOut() {
  const box = (property: string, value: (element: HTMLElement) => number) =>
    vi.spyOn(HTMLElement.prototype, property as "offsetLeft", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.dataset.id ? value(this) : 0;
    });
  box("offsetLeft", (element) => (element.dataset.id === "a" ? 4 : 64));
  box("offsetTop", () => 2);
  box("offsetWidth", (element) => (element.dataset.id === "a" ? 60 : 48));
  box("offsetHeight", () => 28);
}

describe("useSlidingIndicator", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("leaves the chosen item its own fill when nothing is laid out", () => {
    const { getByTestId } = render(<Group selected="a" />);
    expect(getByTestId("group")).not.toHaveAttribute("data-indicator");
  });

  it("places the indicator on the chosen item and follows a new choice", () => {
    layOut();
    const { getByTestId, rerender } = render(<Group selected="a" />);
    const group = getByTestId("group");
    expect(group).toHaveAttribute("data-indicator", "ready");
    expect(group.style.getPropertyValue("--indicator-x")).toBe("4px");
    expect(group.style.getPropertyValue("--indicator-w")).toBe("60px");
    expect(group.style.getPropertyValue("--indicator-h")).toBe("28px");

    rerender(<Group selected="b" />);
    expect(group.style.getPropertyValue("--indicator-x")).toBe("64px");
    expect(group.style.getPropertyValue("--indicator-w")).toBe("48px");
  });

  it("hides the indicator when the choice is cleared", () => {
    layOut();
    const { getByTestId, rerender } = render(<Group selected="a" />);
    rerender(<Group selected={null} />);
    expect(getByTestId("group")).not.toHaveAttribute("data-indicator");
  });
});
