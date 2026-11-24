import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { fetchComfyPresets } from "@/features/automation/api/jobs";
import type { ComfyPresetsResponse } from "@/shared/types";
import { queryWrapper } from "@/test/queryClient";
import { useComfyPresetList } from "./useComfyPresets";

vi.mock("@/features/automation/api/jobs", () => ({
  fetchComfyPresets: vi.fn<typeof fetchComfyPresets>(),
}));

// Polls quickly here; the dialogs' interval is seconds.
vi.mock("@/features/automation/lib/servicePoll", () => ({ SERVICE_POLL_MS: 100 }));

const fetchPresets = vi.mocked(fetchComfyPresets);

function listing(available: boolean): ComfyPresetsResponse {
  return { presets: [], available, base_url: "http://127.0.0.1:9000" };
}

describe("useComfyPresetList", () => {
  it("polls silently while open, so ComfyUI coming up shows without reopening", async () => {
    fetchPresets.mockResolvedValueOnce(listing(false)).mockResolvedValue(listing(true));
    const { wrapper } = queryWrapper();
    const seen: string[] = [];

    renderHook(
      () => {
        const state = useComfyPresetList("run");
        const service = state.status === "ready" ? state.service : state.status;
        if (seen.at(-1) !== service) seen.push(service);
        return state;
      },
      { wrapper },
    );

    await waitFor(() => expect(seen.at(-1)).toBe("ready"));
    // The list's own first load stands in for checking; no later poll shows it again.
    expect(seen).toEqual(["loading", "offline", "ready"]);
  });
});
