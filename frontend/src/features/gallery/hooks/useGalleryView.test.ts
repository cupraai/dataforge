import { act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { GalleryView } from "@/features/gallery/preferences/galleryDisplayPreferences";
import { renderHookWithQueryClient } from "@/test/queryClient";
import { galleryViewKey, useGalleryView } from "./useGalleryView";

const loadMock = vi.fn<(...args: unknown[]) => unknown>();
const updateMock = vi.fn<(...args: unknown[]) => unknown>();
const readCachedMock = vi.fn<(...args: unknown[]) => unknown>();

vi.mock("@/features/gallery/preferences/galleryDisplayPreferences", () => ({
  fetchGalleryView: (...args: unknown[]) => loadMock(...args),
  updateGalleryView: (...args: unknown[]) => updateMock(...args),
  readCachedGalleryView: (...args: unknown[]) => readCachedMock(...args),
}));

const OUTPUT = "C:\\ComfyUI\\output";
const DATASET = "C:\\datasets\\sample";
const DEFAULTS: GalleryView = { mode: "large", sort: "date-desc" };

function view(overrides: Partial<GalleryView> = {}): GalleryView {
  return { ...DEFAULTS, ...overrides };
}

describe("useGalleryView", () => {
  afterEach(() => {
    loadMock.mockReset();
    updateMock.mockReset();
    readCachedMock.mockReset();
  });

  it("loads the stored mode and sort for the open folder", async () => {
    readCachedMock.mockReturnValue(null);
    loadMock.mockResolvedValue(view({ mode: "list", sort: "name-asc" }));

    const { result } = renderHookWithQueryClient(() => useGalleryView(OUTPUT));

    expect(result.current.displayMode).toBe("large");
    expect(result.current.sort).toBe("date-desc");
    await waitFor(() => expect(result.current.displayMode).toBe("list"));
    expect(result.current.sort).toBe("name-asc");
    expect(loadMock).toHaveBeenCalledWith(OUTPUT);
  });

  it("paints the cached view before the request resolves", () => {
    readCachedMock.mockReturnValue(view({ mode: "small", sort: "size-desc" }));
    loadMock.mockReturnValue(new Promise(() => {}));

    const { result } = renderHookWithQueryClient(() => useGalleryView(OUTPUT));

    expect(result.current.displayMode).toBe("small");
    expect(result.current.sort).toBe("size-desc");
  });

  it("gives each folder its own sort", async () => {
    readCachedMock.mockReturnValue(null);
    loadMock.mockImplementation(async (folder) =>
      folder === OUTPUT ? view({ sort: "created-desc" }) : view({ sort: "name-asc" }),
    );

    const { result, rerender } = renderHookWithQueryClient(
      ({ folder }: { folder: string }) => useGalleryView(folder),
      { initialProps: { folder: OUTPUT } },
    );
    await waitFor(() => expect(result.current.sort).toBe("created-desc"));

    rerender({ folder: DATASET });

    await waitFor(() => expect(result.current.sort).toBe("name-asc"));
  });

  it("re-seeds on navigation instead of showing the previous folder's view", async () => {
    readCachedMock.mockReturnValue(null);
    loadMock.mockResolvedValue(view({ mode: "list", sort: "name-asc" }));

    const { result, rerender } = renderHookWithQueryClient(
      ({ folder }: { folder: string }) => useGalleryView(folder),
      { initialProps: { folder: OUTPUT } },
    );

    await waitFor(() => expect(result.current.displayMode).toBe("list"));

    loadMock.mockReturnValue(new Promise(() => {}));
    rerender({ folder: DATASET });

    expect(result.current.displayMode).toBe("large");
    expect(result.current.sort).toBe("date-desc");
  });

  it("applies a sort at once and saves only the sort for that folder", async () => {
    readCachedMock.mockReturnValue(null);
    loadMock.mockResolvedValue(view({ mode: "list" }));
    updateMock.mockResolvedValue(view({ mode: "list", sort: "name-desc" }));

    const { result } = renderHookWithQueryClient(() => useGalleryView(OUTPUT));
    await waitFor(() => expect(result.current.displayMode).toBe("list"));

    act(() => result.current.setSort("name-desc"));

    await waitFor(() => expect(result.current.sort).toBe("name-desc"));
    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith(OUTPUT, view({ mode: "list", sort: "name-desc" }), {
        sort: "name-desc",
      }),
    );
    expect(result.current.displayMode).toBe("list");
  });

  it("keeps both halves when the mode and sort change before either save answers", async () => {
    readCachedMock.mockReturnValue(null);
    loadMock.mockResolvedValue(DEFAULTS);
    let answerModeSave!: (saved: GalleryView) => void;
    updateMock
      .mockReturnValueOnce(
        new Promise<GalleryView>((resolve) => {
          answerModeSave = resolve;
        }),
      )
      .mockReturnValueOnce(new Promise(() => {}));

    const { result } = renderHookWithQueryClient(() => useGalleryView(OUTPUT));
    await waitFor(() => expect(loadMock).toHaveBeenCalled());

    act(() => result.current.setDisplayMode("list"));
    act(() => result.current.setSort("name-asc"));
    // Answered before the sort reached the server, so it still carries the old sort.
    await act(async () => answerModeSave(view({ mode: "list" })));

    await waitFor(() => {
      expect(result.current.displayMode).toBe("list");
      expect(result.current.sort).toBe("name-asc");
    });
  });

  it("keeps a pending save attached to the folder where it started", async () => {
    readCachedMock.mockReturnValue(null);
    loadMock.mockResolvedValue(DEFAULTS);
    let finishSave!: (saved: GalleryView) => void;
    const saving = new Promise<GalleryView>((resolve) => {
      finishSave = resolve;
    });
    updateMock.mockReturnValue(saving);
    const { result, rerender, client } = renderHookWithQueryClient(
      ({ folder }: { folder: string }) => useGalleryView(folder),
      { initialProps: { folder: OUTPUT } },
    );
    await waitFor(() => expect(loadMock).toHaveBeenCalledWith(OUTPUT));
    act(() => result.current.setSort("name-asc"));
    rerender({ folder: DATASET });
    await waitFor(() => expect(client.getQueryData(galleryViewKey(DATASET))).toEqual(DEFAULTS));
    await act(async () => {
      finishSave(view({ sort: "name-asc" }));
      await saving;
    });
    expect(client.getQueryData(galleryViewKey(DATASET))).toEqual(DEFAULTS);
    expect(client.getQueryData<GalleryView>(galleryViewKey(OUTPUT))?.sort).toBe("name-asc");
  });

  it("keeps the choice when persistence fails", async () => {
    readCachedMock.mockReturnValue(null);
    loadMock.mockResolvedValue(DEFAULTS);
    updateMock.mockRejectedValue(new Error("offline"));

    const { result } = renderHookWithQueryClient(() => useGalleryView(OUTPUT));
    await waitFor(() => expect(loadMock).toHaveBeenCalled());

    act(() => result.current.setDisplayMode("list"));

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    expect(result.current.displayMode).toBe("list");
  });

  it("keeps the cached view when the backend cannot be reached", async () => {
    readCachedMock.mockReturnValue(view({ mode: "list", sort: "name-asc" }));
    loadMock.mockRejectedValue(new Error("offline"));

    const { result } = renderHookWithQueryClient(() => useGalleryView(OUTPUT));

    await waitFor(() => expect(loadMock).toHaveBeenCalled());
    expect(result.current.displayMode).toBe("list");
    expect(result.current.sort).toBe("name-asc");
  });

  it("does not call the backend without an open folder", () => {
    readCachedMock.mockReturnValue(null);

    const { result } = renderHookWithQueryClient(() => useGalleryView(undefined));

    act(() => result.current.setDisplayMode("list"));
    act(() => result.current.setSort("name-asc"));

    expect(loadMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
    expect(result.current.displayMode).toBe("large");
    expect(result.current.sort).toBe("date-desc");
  });
});
