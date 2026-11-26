import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type * as VisionLlmApi from "@/features/automation/api/visionLlm";
import type { VisionLlmInfo } from "@/features/automation/api/visionLlm";
import { queryWrapper } from "@/test/queryClient";
import { useVisionLlmInfo } from "./useVisionLlmInfo";

const fetchVisionLlmInfo = vi.fn<() => Promise<VisionLlmInfo>>();

vi.mock("@/features/automation/api/visionLlm", async (importOriginal) => ({
  ...(await importOriginal<typeof VisionLlmApi>()),
  fetchVisionLlmInfo: () => fetchVisionLlmInfo(),
}));

// Polls quickly here; the dialogs' interval is seconds.
vi.mock("@/features/automation/lib/servicePoll", () => ({ SERVICE_POLL_MS: 100 }));

const SERVED: VisionLlmInfo = {
  model: "qwen38",
  baseUrl: "http://127.0.0.1:8888/v1",
  servedModel: "Qwen3.8-27B",
  reasoningEfforts: ["low", "medium", "xhigh"],
  detail: null,
  reachable: true,
};

beforeEach(() => {
  fetchVisionLlmInfo.mockReset();
});

/** Every status an open dialog showed, in order, without repeats. */
function trackService(wrapper: ReturnType<typeof queryWrapper>["wrapper"]): string[] {
  const seen: string[] = [];
  renderHook(
    () => {
      const state = useVisionLlmInfo();
      if (seen.at(-1) !== state.service) seen.push(state.service);
      return state;
    },
    { wrapper },
  );
  return seen;
}

describe("useVisionLlmInfo", () => {
  it("polls silently: a server that comes back shows ready without checking again", async () => {
    fetchVisionLlmInfo
      .mockResolvedValueOnce({ ...SERVED, servedModel: null, reachable: false })
      .mockResolvedValue(SERVED);
    const { wrapper } = queryWrapper();

    const seen = trackService(wrapper);

    await waitFor(() => expect(seen.at(-1)).toBe("ready"));
    expect(seen).toEqual(["checking", "offline", "ready"]);
  });

  it("polls silently: a server that stops shows offline without checking again", async () => {
    fetchVisionLlmInfo
      .mockResolvedValueOnce(SERVED)
      .mockResolvedValue({ ...SERVED, servedModel: null, reachable: false });
    const { wrapper } = queryWrapper();

    const seen = trackService(wrapper);

    await waitFor(() => expect(seen.at(-1)).toBe("offline"));
    expect(seen).toEqual(["checking", "ready", "offline"]);
  });

  it("is not ready until the server answers", async () => {
    let answer: (info: VisionLlmInfo) => void = () => {};
    fetchVisionLlmInfo.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { wrapper } = queryWrapper();

    const { result } = renderHook(useVisionLlmInfo, { wrapper });

    expect(result.current).toEqual({
      ready: false,
      info: null,
      unreachable: false,
      service: "checking",
      issue: null,
    });
    act(() => answer(SERVED));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.info).toEqual(SERVED);
  });

  it("keeps an answer for the next dialog instead of asking again", async () => {
    fetchVisionLlmInfo.mockResolvedValue(SERVED);
    const { wrapper } = queryWrapper();
    const first = renderHook(useVisionLlmInfo, { wrapper });
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    first.unmount();
    // The open dialog polls, so count only what reopening asks.
    const asked = fetchVisionLlmInfo.mock.calls.length;

    const second = renderHook(useVisionLlmInfo, { wrapper });

    expect(second.result.current).toEqual({
      ready: true,
      info: SERVED,
      unreachable: false,
      service: "ready",
      issue: null,
    });
    expect(fetchVisionLlmInfo).toHaveBeenCalledTimes(asked);
  });

  it("asks again after no answer, waiting rather than showing the old failure", async () => {
    fetchVisionLlmInfo.mockResolvedValue({ ...SERVED, servedModel: null, reachable: false });
    const { wrapper } = queryWrapper();
    const first = renderHook(useVisionLlmInfo, { wrapper });
    await waitFor(() => expect(first.result.current.unreachable).toBe(true));
    first.unmount();
    fetchVisionLlmInfo.mockResolvedValue(SERVED);

    const second = renderHook(useVisionLlmInfo, { wrapper });

    expect(second.result.current.ready).toBe(false);
    await waitFor(() =>
      expect(second.result.current).toEqual({
        ready: true,
        info: SERVED,
        unreachable: false,
        service: "ready",
        issue: null,
      }),
    );
  });

  it("warns with the fix when the server answers but its model cannot be read", async () => {
    fetchVisionLlmInfo.mockResolvedValue({
      ...SERVED,
      servedModel: null,
      reasoningEfforts: null,
      detail: "The server refused the API key",
    });
    const { wrapper } = queryWrapper();

    const { result } = renderHook(useVisionLlmInfo, { wrapper });

    await waitFor(() => expect(result.current.service).toBe("warning"));
    expect(result.current.issue).toBe(
      "The server refused the API key, so every reasoning level is offered. " +
        "Check the vision server in Settings.",
    );
  });

  it("warns, rather than claiming the server is ready, when DataForge cannot be asked", async () => {
    fetchVisionLlmInfo.mockRejectedValue(new Error("Backend down"));
    const { wrapper } = queryWrapper();

    const { result } = renderHook(useVisionLlmInfo, { wrapper });

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current).toMatchObject({ info: null, unreachable: false, service: "warning" });
    expect(result.current.issue).toContain("Could not check the vision server");
    expect(result.current.issue).toContain("Backend down");
  });
});
