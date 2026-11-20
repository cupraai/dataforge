import { describe, expect, it, vi } from "vite-plus/test";
import { homeFolder } from "@/test/fixtures";
import { renderWithThumbnails as render } from "@/test/renderWithThumbnails";
import { GalleryListHeader } from "./GalleryListHeader";
import { GalleryListRow } from "./GalleryListRow";

describe("GalleryListHeader", () => {
  it.each([false, true])(
    "has one heading per row cell, so each sits over its column (selecting: %s)",
    (selectionMode) => {
      const { container } = render(
        <>
          <GalleryListHeader selectionMode={selectionMode} />
          <GalleryListRow
            item={homeFolder.items[0]}
            onSelect={vi.fn<(path: string) => void>()}
            selectionMode={selectionMode}
          />
        </>,
      );

      const header = container.querySelector(".gallery-list-header");
      expect(header).toHaveTextContent(/Name.*Caption.*Pixels.*Ratio.*Length.*Size.*Modified/);
      expect(header?.childElementCount).toBe(
        container.querySelector(".gallery-list-row")?.childElementCount,
      );
      expect(header?.classList.contains("gallery-list-header--selecting")).toBe(selectionMode);
    },
  );
});
