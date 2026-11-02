import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { GalleryRanges } from "@/features/gallery/lib/query";
import type { GalleryItem } from "@/shared/types";
import { HOME_PATH, mediaItem } from "@/test/fixtures";
import { FilterRangesDialog } from "./FilterRangesDialog";

/** Two clips at 1-2 s, one at 2-4 s and one at 4-6 s; the still has no duration. */
const ITEMS: GalleryItem[] = [
  mediaItem("a.mp4", HOME_PATH, { duration: 1 }),
  mediaItem("b.mp4", HOME_PATH, { duration: 1.5 }),
  mediaItem("c.mp4", HOME_PATH, { duration: 3 }),
  mediaItem("d.mp4", HOME_PATH, { duration: 5 }),
  mediaItem("still.png", HOME_PATH, { width: 1000, height: 1000 }),
];

function renderDialog(ranges: GalleryRanges = {}, items = ITEMS) {
  const onApply = vi.fn<(ranges: GalleryRanges) => void>();
  const onClose = vi.fn<() => void>();
  render(
    <FilterRangesDialog
      ranges={ranges}
      focusAxis="duration"
      rangeBaseItems={() => items}
      onApply={onApply}
      onClose={onClose}
    />,
  );
  const durations = screen.getByRole("region", { name: "Video duration" });
  return { onApply, onClose, durations };
}

const bar = (axis: HTMLElement, name: RegExp) => within(axis).getByRole("button", { name });

describe("FilterRangesDialog", () => {
  it("charts each axis from the files the other filters keep", () => {
    const { durations } = renderDialog();

    expect(bar(durations, /^0 – 2 s|^< 2 s/)).toHaveAccessibleName("< 2 s: 2 files");
    expect(bar(durations, /^2 – 4 s/)).toHaveAccessibleName("2 – 4 s: 1 file");
    expect(bar(durations, /^≥ 15 s/)).toHaveAccessibleName("≥ 15 s: 0 files");
    expect(screen.getByRole("textbox", { name: "Minimum video duration" })).toHaveFocus();
  });

  it("picks a bar, extends the span to another, and clears on the only picked bar", async () => {
    const user = userEvent.setup();
    const { durations } = renderDialog();
    const status = screen.getByRole("status");

    await user.click(bar(durations, /^2 – 4 s/));
    await user.unhover(bar(durations, /^2 – 4 s/));
    expect(within(durations).getByText("2 – 4 s", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Minimum video duration" })).toHaveValue("2");
    expect(screen.getByRole("textbox", { name: "Maximum video duration" })).toHaveValue("4");
    expect(status).toHaveTextContent("1 file matches");

    await user.click(bar(durations, /^< 2 s/));
    expect(bar(durations, /^< 2 s/)).toHaveAttribute("aria-pressed", "true");
    expect(bar(durations, /^2 – 4 s/)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("textbox", { name: "Minimum video duration" })).toHaveValue("");
    expect(status).toHaveTextContent("3 files match");

    await user.click(bar(durations, /^2 – 4 s/));
    expect(bar(durations, /^< 2 s/)).toHaveAttribute("aria-pressed", "false");
    await user.click(bar(durations, /^2 – 4 s/));
    await user.unhover(bar(durations, /^2 – 4 s/));
    expect(within(durations).getByText("Any")).toBeInTheDocument();
    expect(status).toHaveTextContent("5 files match");
  });

  it("names the bar under the pointer in the axis summary", async () => {
    const user = userEvent.setup();
    const { durations } = renderDialog();

    await user.hover(bar(durations, /^2 – 4 s/));
    expect(durations).toHaveTextContent("2 – 4 s · 1 file");

    await user.unhover(bar(durations, /^2 – 4 s/));
    expect(durations).not.toHaveTextContent("2 – 4 s · 1 file");
    expect(within(durations).getByText("Any")).toBeInTheDocument();
  });

  it("takes typed bounds with a decimal comma and applies them", async () => {
    const user = userEvent.setup();
    const { onApply, onClose } = renderDialog();

    await user.type(screen.getByRole("textbox", { name: "Minimum megapixels" }), "0,5");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(onApply).toHaveBeenCalledWith({ megapixels: { min: 0.5, max: null } });
    expect(onClose).toHaveBeenCalled();
  });

  it("refuses a minimum that is not below the maximum", async () => {
    const user = userEvent.setup();
    const { onApply } = renderDialog();

    await user.type(screen.getByRole("textbox", { name: "Minimum caption length" }), "600");
    await user.type(screen.getByRole("textbox", { name: "Maximum caption length" }), "400");

    expect(screen.getByText("The minimum must be below the maximum.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("resets one axis to Any, and Clear all resets every axis", async () => {
    const user = userEvent.setup();
    const { onApply, durations } = renderDialog({
      duration: { min: 2, max: null },
      megapixels: { min: 1, max: 2 },
    });

    await user.click(within(durations).getByRole("button", { name: "Any video duration" }));
    expect(screen.getByRole("textbox", { name: "Minimum video duration" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Minimum megapixels" })).toHaveValue("1");

    await user.click(screen.getByRole("button", { name: "Clear all" }));
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(onApply).toHaveBeenCalledWith({});
  });

  it("says when no file has the value instead of drawing an empty chart", () => {
    renderDialog({}, [mediaItem("still.png", HOME_PATH, { width: 1000, height: 1000 })]);

    const durations = screen.getByRole("region", { name: "Video duration" });
    expect(within(durations).queryByRole("button", { name: /files?$/ })).not.toBeInTheDocument();
    expect(durations).toHaveTextContent("No videos here have a known length.");
  });
});
