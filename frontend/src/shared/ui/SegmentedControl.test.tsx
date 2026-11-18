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

  it("gives a swatch option its look and leaves the others on the accent", () => {
    render(
      <SegmentedControl
        label="Look"
        value="warm"
        options={[
          { value: "plain", label: "Plain" },
          { value: "warm", label: "Warm", swatch: "linear-gradient(90deg, red, orange)" },
        ]}
        onChange={vi.fn<(value: string) => void>()}
      />,
    );

    const warm = screen.getByRole("radio", { name: "Warm" }).closest("label");
    expect(warm).toHaveClass("segmented__option--swatch");
    expect(warm?.style.getPropertyValue("--segment-swatch")).toBe(
      "linear-gradient(90deg, red, orange)",
    );
    expect(screen.getByRole("radio", { name: "Plain" }).closest("label")).not.toHaveClass(
      "segmented__option--swatch",
    );
  });

  it("takes its name from a visible caption and announces an option's key", () => {
    render(
      <>
        <span id="caption">Brush</span>
        <SegmentedControl
          labelledBy="caption"
          value="paint"
          options={[
            {
              value: "paint",
              label: "Paint",
              hint: "Paint the selection",
              shortcut: { group: "global", label: "Brush", chords: [{ key: "b" }] },
            },
            { value: "erase", label: "Erase" },
          ]}
          onChange={vi.fn<(value: string) => void>()}
        />
      </>,
    );

    expect(screen.getByRole("radiogroup", { name: "Brush" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Paint" })).toHaveAttribute("aria-keyshortcuts", "B");
    expect(screen.getByRole("radio", { name: "Erase" })).not.toHaveAttribute("aria-keyshortcuts");
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
