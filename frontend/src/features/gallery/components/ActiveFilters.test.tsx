import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ActiveFilters } from "./ActiveFilters";
import type {
  FileFilter,
  ItemFilter,
  MediaTypeFilter,
  GalleryRange,
  GalleryRanges,
  RangeAxis,
} from "@/features/gallery/lib/query";

function renderFilters(ranges: GalleryRanges = {}) {
  const handlers = {
    onFilterChange: vi.fn<(value: ItemFilter) => void>(),
    onMediaTypeFilterChange: vi.fn<(value: MediaTypeFilter) => void>(),
    onFileFilterChange: vi.fn<(value: FileFilter) => void>(),
    onRangeChange: vi.fn<(axis: RangeAxis, range: GalleryRange | null) => void>(),
    onClearFilters: vi.fn<() => void>(),
  };
  render(
    <ActiveFilters
      filter="captioned"
      mediaTypeFilter="video"
      fileFilter="edited"
      ranges={ranges}
      {...handlers}
    />,
  );
  return handlers;
}

describe("ActiveFilters", () => {
  it.each([
    ["Remove caption filter", "onFilterChange", "all"],
    ["Remove media type filter", "onMediaTypeFilterChange", "all"],
    ["Remove file filter", "onFileFilterChange", "all"],
  ] as const)("%s resets only that filter", async (name, handler, value) => {
    const user = userEvent.setup();
    const handlers = renderFilters();

    await user.click(screen.getByRole("button", { name }));

    const calls = Object.fromEntries(
      Object.entries(handlers).map(([key, mock]) => [key, mock.mock.calls]),
    );
    expect(calls).toEqual({
      onFilterChange: [],
      onMediaTypeFilterChange: [],
      onFileFilterChange: [],
      onRangeChange: [],
      onClearFilters: [],
      [handler]: [[value]],
    });
  });

  it("shows a chip per range that removes only that range", async () => {
    const user = userEvent.setup();
    const handlers = renderFilters({ duration: { min: 2, max: 4 }, megapixels: { min: 1 } });

    expect(screen.getByRole("button", { name: "Remove duration range" })).toHaveTextContent(
      "2 – 4 s",
    );
    expect(screen.getByRole("button", { name: "Remove megapixels range" })).toHaveTextContent(
      "≥ 1 MP",
    );

    await user.click(screen.getByRole("button", { name: "Remove duration range" }));

    expect(handlers.onRangeChange).toHaveBeenCalledWith("duration", null);
    expect(handlers.onClearFilters).not.toHaveBeenCalled();
  });

  it("clears every filter and range in one go", async () => {
    const user = userEvent.setup();
    const handlers = renderFilters({ caption_length: { max: 256 } });

    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(handlers.onClearFilters).toHaveBeenCalledTimes(1);
  });

  it("appears for a range alone", () => {
    render(
      <ActiveFilters
        filter="all"
        mediaTypeFilter="all"
        fileFilter="all"
        ranges={{ caption_length: { max: 256 } }}
        onFilterChange={vi.fn<(value: ItemFilter) => void>()}
        onMediaTypeFilterChange={vi.fn<(value: MediaTypeFilter) => void>()}
        onFileFilterChange={vi.fn<(value: FileFilter) => void>()}
        onRangeChange={vi.fn<(axis: RangeAxis, range: GalleryRange | null) => void>()}
        onClearFilters={vi.fn<() => void>()}
      />,
    );

    expect(screen.getByRole("button", { name: "Remove caption length range" })).toHaveTextContent(
      "< 256 chars",
    );
  });
});
