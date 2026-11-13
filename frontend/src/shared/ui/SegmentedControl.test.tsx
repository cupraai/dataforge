import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SegmentedControl } from "./SegmentedControl";

const OPTIONS = [
  { value: "day", label: "Day" },
  { value: "month", label: "Month", count: 3 },
  { value: "year", label: "Year", disabled: true },
] as const;

describe("SegmentedControl", () => {
  it("is a named radio group whose options carry their counts", async () => {
    const onChange = vi.fn<(value: "day" | "month" | "year") => void>();
    render(<SegmentedControl label="Grouping" value="day" options={OPTIONS} onChange={onChange} />);

    expect(screen.getByRole("radiogroup", { name: "Grouping" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Day" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Year" })).toBeDisabled();

    await userEvent.setup().click(screen.getByRole("radio", { name: /^Month/ }));
    expect(onChange).toHaveBeenCalledWith("month");
  });

  it("checks nothing for a value the options do not share", () => {
    render(
      <SegmentedControl
        label="Grouping"
        value={null}
        options={OPTIONS}
        onChange={vi.fn<(value: string) => void>()}
      />,
    );

    expect(screen.queryByRole("radio", { checked: true })).not.toBeInTheDocument();
  });
});
