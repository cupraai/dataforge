import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { ExternalOstrisJobsResponse } from "@/shared/types";
import { queryWrapper } from "@/test/queryClient";
import { useAiToolkitStatus } from "./useAiToolkitStatus";

const fetchOstrisJobs = vi.fn<() => Promise<ExternalOstrisJobsResponse>>();

vi.mock("@/features/jobs/api/externalJobs", () => ({
  fetchOstrisJobs: () => fetchOstrisJobs(),
}));

// Polls quickly here; the dialogs' interval is seconds.
vi.mock("@/features/automation/lib/servicePoll", () => ({ SERVICE_POLL_MS: 100 }));

/** The backend numbers each change, and a read keeps whichever snapshot is newer. */
function listing(available: boolean, revision: number): ExternalOstrisJobsResponse {
  return { jobs: [], active_count: 0, available, revision };
}

beforeEach(() => {
  fetchOstrisJobs.mockReset();
});

describe("useAiToolkitStatus", () => {
  it("checks AI-Toolkit again on opening instead of trusting the last poll", async () => {
    fetchOstrisJobs.mockResolvedValue(listing(true, 1));
    const { wrapper } = queryWrapper();
    const first = renderHook(useAiToolkitStatus, { wrapper });
    await waitFor(() => expect(first.result.current).toBe("ready"));
    first.unmount();
    fetchOstrisJobs.mockResolvedValue(listing(false, 2));

    const second = renderHook(useAiToolkitStatus, { wrapper });

    expect(second.result.current).toBe("checking");
    await waitFor(() => expect(second.result.current).toBe("offline"));
  });

  it("polls silently while open, so a stopped AI-Toolkit shows without reopening", async () => {
    fetchOstrisJobs.mockResolvedValueOnce(listing(true, 1)).mockResolvedValue(listing(false, 2));
    const { wrapper } = queryWrapper();
    const seen: string[] = [];

    renderHook(
      () => {
        const state = useAiToolkitStatus();
        if (seen.at(-1) !== state) seen.push(state);
        return state;
      },
      { wrapper },
    );

    await waitFor(() => expect(seen.at(-1)).toBe("offline"));
    expect(seen).toEqual(["checking", "ready", "offline"]);
  });

  it("reads a failed request as AI-Toolkit not answering", async () => {
    fetchOstrisJobs.mockRejectedValue(new Error("refused"));
    const { wrapper } = queryWrapper();

    const { result } = renderHook(useAiToolkitStatus, { wrapper });

    await waitFor(() => expect(result.current).toBe("offline"));
  });
});
