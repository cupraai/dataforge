import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import * as api from "@/features/gallery/api/captions";
import { HOME_PATH } from "@/test/fixtures";
import { useCaptionBackup } from "./useCaptionBackup";
import { renderHookWithQueryClient } from "@/test/queryClient";

const MEDIA_PATH = `${HOME_PATH}\\sunset.png`;

describe("useCaptionBackup", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the backed up caption", async () => {
    vi.spyOn(api, "fetchCaptionBackup").mockResolvedValue({
      exists: true,
      description: "Backed up caption.",
    });

    const { result } = renderHookWithQueryClient(() => useCaptionBackup(MEDIA_PATH, true));

    await waitFor(() => expect(result.current.backup).toBe("Backed up caption."));
  });

  it("stays null when the folder has no backup of the file", async () => {
    const fetchBackup = vi
      .spyOn(api, "fetchCaptionBackup")
      .mockResolvedValue({ exists: false, description: null });

    const { result } = renderHookWithQueryClient(() => useCaptionBackup(MEDIA_PATH, true));

    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(fetchBackup).toHaveBeenCalled();
    expect(result.current.backup).toBeNull();
  });

  it("does not ask the server when the folder has no backup at all", () => {
    const fetchBackup = vi.spyOn(api, "fetchCaptionBackup");

    const { result } = renderHookWithQueryClient(() => useCaptionBackup(MEDIA_PATH, false));

    expect(fetchBackup).not.toHaveBeenCalled();
    expect(result.current).toEqual({ backup: null, pending: false });
  });

  it("drops the previous file's backup while the next one loads", async () => {
    vi.spyOn(api, "fetchCaptionBackup").mockResolvedValue({
      exists: true,
      description: "First caption.",
    });

    const { result, rerender } = renderHookWithQueryClient(
      ({ path }) => useCaptionBackup(path, true),
      {
        initialProps: { path: MEDIA_PATH },
      },
    );

    await waitFor(() => expect(result.current.backup).toBe("First caption."));

    vi.spyOn(api, "fetchCaptionBackup").mockResolvedValue({ exists: false, description: null });
    rerender({ path: `${HOME_PATH}\\harbour.png` });

    expect(result.current).toEqual({ backup: null, pending: true });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.backup).toBeNull();
  });
});
