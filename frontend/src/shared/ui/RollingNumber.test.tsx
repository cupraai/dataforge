import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { RollingNumber } from "./RollingNumber";

const columns = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>(".rolling-number__digits > *")].map(
    (column) => column.style.getPropertyValue("--digit") || column.dataset.char,
  );

describe("RollingNumber", () => {
  it("reads as the value, with the drawn digits hidden", () => {
    const { container } = render(<RollingNumber value="99+" />);
    expect(container).toHaveTextContent(/^99\+$/);
    expect(screen.getByText("99+")).toHaveClass("rolling-number__text");
    expect(container.querySelector(".rolling-number__digits")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(columns(container)).toEqual(["9", "9", "+"]);
  });

  it("keeps each column from the right, so a new digit adds a column on the left", () => {
    const { container, rerender } = render(<RollingNumber value={99} />);
    const [tens, units] = container.querySelectorAll(".rolling-number__digit");

    rerender(<RollingNumber value={100} />);
    const after = container.querySelectorAll(".rolling-number__digit");
    expect(columns(container)).toEqual(["1", "0", "0"]);
    // The same elements roll, rather than remounting at their new value.
    expect(after[1]).toBe(tens);
    expect(after[2]).toBe(units);
  });
});
