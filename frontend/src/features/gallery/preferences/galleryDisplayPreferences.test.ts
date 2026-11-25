import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  fetchGalleryView,
  readCachedGalleryView,
  updateGalleryView,
} from "./galleryDisplayPreferences";

const requestJsonMock = vi.fn<(...args: unknown[]) => unknown>();
const putJsonMock = vi.fn<(...args: unknown[]) => unknown>();

vi.mock("@/shared/api/http", () => ({
  requestJson: (...args: unknown[]) => requestJsonMock(...args),
  putJson: (...args: unknown[]) => putJsonMock(...args),
}));

describe("galleryDisplayPreferences", () => {
  afterEach(() => {
    requestJsonMock.mockReset();
    putJsonMock.mockReset();
    localStorage.clear();
  });

  it("loads a folder's mode and sort from the backend and mirrors them locally", async () => {
    requestJsonMock.mockResolvedValue({
      mode: "list",
      sort: "name-asc",
      folder_path: "C:\\Photos\\Trip",
    });

    const view = await fetchGalleryView("C:\\Photos\\Trip");

    expect(requestJsonMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/preferences/gallery-display?"),
    );
    expect(view).toEqual({ mode: "list", sort: "name-asc" });
    expect(readCachedGalleryView("C:\\Photos\\Trip")).toEqual({ mode: "list", sort: "name-asc" });
  });

  it("sends only the changed field and mirrors the whole view", async () => {
    putJsonMock.mockResolvedValue({
      mode: "small",
      sort: "size-desc",
      folder_path: "C:\\Photos\\A",
    });

    const view = await updateGalleryView(
      "C:\\Photos\\A",
      { mode: "small", sort: "size-desc" },
      { sort: "size-desc" },
    );

    expect(putJsonMock).toHaveBeenCalledWith("/api/preferences/gallery-display", {
      sort: "size-desc",
      folder_path: "C:\\Photos\\A",
    });
    expect(view).toEqual({ mode: "small", sort: "size-desc" });
    expect(readCachedGalleryView("C:\\Photos\\A")).toEqual(view);
  });

  it("mirrors the choice before the save answers", () => {
    putJsonMock.mockReturnValue(new Promise(() => {}));

    void updateGalleryView(
      "C:\\Photos\\A",
      { mode: "list", sort: "name-desc" },
      { sort: "name-desc" },
    );

    expect(readCachedGalleryView("C:\\Photos\\A")).toEqual({ mode: "list", sort: "name-desc" });
  });

  it("caches under a separator- and case-insensitive key", async () => {
    putJsonMock.mockResolvedValue({
      mode: "list",
      sort: "date-desc",
      folder_path: "C:\\Photos\\A",
    });
    await updateGalleryView("C:\\Photos\\A", { mode: "list", sort: "date-desc" }, { mode: "list" });

    expect(readCachedGalleryView("c:/photos/a")?.mode).toBe("list");
  });

  it("reports no cached view for an unknown folder", () => {
    expect(readCachedGalleryView("C:\\Photos\\Nope")).toBeNull();
    expect(readCachedGalleryView(undefined)).toBeNull();
  });

  it("ignores a cache entry holding an unknown mode or sort", () => {
    localStorage.setItem(
      "gallery-views",
      JSON.stringify({
        "c:\\photos\\a": { mode: "mosaic", sort: "name-asc" },
        "c:\\photos\\b": { mode: "list", sort: "shuffle" },
      }),
    );

    expect(readCachedGalleryView("C:\\Photos\\A")).toBeNull();
    expect(readCachedGalleryView("C:\\Photos\\B")).toBeNull();
  });
});
