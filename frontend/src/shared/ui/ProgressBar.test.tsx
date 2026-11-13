import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressBar } from "./ProgressBar";

describe("ProgressBar", () => {
  it("reports its rounded value under its label", () => {
    render(<ProgressBar label="Job progress" value={41.6} />);

    expect(screen.getByRole("progressbar", { name: "Job progress" })).toHaveAttribute(
      "aria-valuenow",
      "42",
    );
  });

  it("is hidden decoration without a label", () => {
    const { container } = render(<ProgressBar value={150} />);

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    const fill = container.querySelector(".progress__fill") as HTMLElement;
    expect(fill.style.width).toBe("100%");
  });
});
