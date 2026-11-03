import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelFillOperation,
  discardFillResult,
  fetchFillOperation,
  fetchFillPresets,
  startImageFill,
} from "@/features/gallery/api/imageFill";
import {
  BRUSH_FRACTION_STEP,
  BRUSH_MAX_FRACTION,
  BRUSH_MIN_FRACTION,
  rasterizeFillMask,
} from "@/features/gallery/lib/fillMask";
import type * as fillMaskLib from "@/features/gallery/lib/fillMask";
import { ApiError } from "@/shared/api/http";
import { AppProviders } from "@/test/AppProviders";
import { makeImageFill } from "@/test/fillControls";
import type { ImageFill, ImageFillOperationResponse } from "@/shared/types";
import {
  FILL_INTERRUPTED_MESSAGE,
  FILL_POLL_INTERVAL_MS,
  useImageFill,
  type UseImageFillOptions,
} from "./useImageFill";

vi.mock("@/features/gallery/api/imageFill", () => ({
  fetchFillPresets: vi.fn<typeof fetchFillPresets>(),
  startImageFill: vi.fn<typeof startImageFill>(),
  fetchFillOperation: vi.fn<typeof fetchFillOperation>(),
  cancelFillOperation: vi.fn<typeof cancelFillOperation>(),
  discardFillResult: vi.fn<typeof discardFillResult>(),
}));

vi.mock("@/features/gallery/lib/fillMask", async (importOriginal) => ({
  ...(await importOriginal<typeof fillMaskLib>()),
  rasterizeFillMask: vi.fn<typeof rasterizeFillMask>(),
}));

const presetsMock = vi.mocked(fetchFillPresets);
const startMock = vi.mocked(startImageFill);
const pollMock = vi.mocked(fetchFillOperation);
const cancelMock = vi.mocked(cancelFillOperation);
const discardMock = vi.mocked(discardFillResult);
const rasterMock = vi.mocked(rasterizeFillMask);

const PHOTO = "C:\\Photos\\scene.png";
const OTHER = "C:\\Photos\\other.png";
const SOURCE = { width: 400, height: 300 };
const KEPT = makeImageFill({ id: "1".repeat(32) });

function operation(
  overrides: Partial<ImageFillOperationResponse> = {},
): ImageFillOperationResponse {
  return { id: "op-1", path: PHOTO, status: "queued", preset: "quality", ...overrides };
}

function succeeded(fill: ImageFill, path = PHOTO): ImageFillOperationResponse {
  return operation({ id: fill.id, path, status: "succeeded", fill });
}

function renderFill(overrides: Partial<UseImageFillOptions> = {}) {
  const onKeep = vi.fn<(fill: ImageFill) => void>();
  const initial: UseImageFillOptions = {
    path: PHOTO,
    source: SOURCE,
    fills: [],
    open: true,
    onKeep,
    ...overrides,
  };
  const view = renderHook((props: UseImageFillOptions) => useImageFill(props), {
    wrapper: AppProviders,
    initialProps: initial,
  });
  return { ...view, onKeep, initial };
}

function paint(result: { current: ReturnType<typeof useImageFill> }) {
  act(() => {
    result.current.beginStroke({ x: 100, y: 100 });
    result.current.extendStroke({ x: 140, y: 120 });
  });
}

async function poll() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FILL_POLL_INTERVAL_MS);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  presetsMock.mockReset().mockResolvedValue({
    presets: [
      { preset: "fast", available: false, reason: "Update ComfyUI for Qwen-Image 2.1." },
      { preset: "quality", available: true, reason: null },
    ],
  });
  startMock.mockReset();
  pollMock.mockReset();
  cancelMock.mockReset().mockImplementation(async (id) => operation({ id, status: "cancelled" }));
  discardMock.mockReset().mockResolvedValue(undefined);
  rasterMock.mockReset().mockResolvedValue("bWFzaw==");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useImageFill", () => {
  it("sends the painted mask on top of the kept fills and offers the result", async () => {
    const fill = makeImageFill({ id: "2".repeat(32), parent_id: KEPT.id });
    startMock.mockResolvedValue(operation({ id: fill.id }));
    pollMock.mockResolvedValueOnce(operation({ id: fill.id, status: "running" }));
    pollMock.mockResolvedValueOnce(succeeded(fill));
    const { result, onKeep } = renderFill({ fills: [KEPT] });
    await waitFor(() => expect(result.current.presets).not.toBeNull());
    paint(result);

    act(() => result.current.generate());
    await waitFor(() => expect(result.current.progress).toBe("queued"));

    expect(rasterMock).toHaveBeenCalledWith(result.current.strokes, SOURCE);
    expect(startMock).toHaveBeenCalledWith(PHOTO, {
      fills: [KEPT],
      mask_png: "bWFzaw==",
      instruction: "",
      preset: "quality",
    });
    expect(result.current.pending).toBe(true);
    expect(result.current.canPaint).toBe(false);

    await poll();
    expect(result.current.progress).toBe("running");
    await poll();

    expect(result.current.candidate).toEqual(fill);
    expect(result.current.previewIds).toEqual([KEPT.id, fill.id]);
    act(() => result.current.setShowBefore(true));
    expect(result.current.previewIds).toEqual([KEPT.id]);

    act(() => result.current.keep());

    expect(onKeep).toHaveBeenCalledWith(fill);
    expect(result.current.candidate).toBeNull();
    expect(result.current.strokes).toEqual([]);
    expect(result.current.pending).toBe(false);
    expect(discardMock).not.toHaveBeenCalled();
  });

  it("names an unavailable preset instead of switching to the other one", async () => {
    const { result } = renderFill();
    await waitFor(() => expect(result.current.presets).not.toBeNull());

    act(() => result.current.setPreset("fast"));
    paint(result);

    expect(result.current.preset).toBe("fast");
    expect(result.current.canGenerate).toBe(false);
    expect(result.current.generateBlocker).toBe("Update ComfyUI for Qwen-Image 2.1.");
  });

  it("needs paint, but no words: a blank instruction removes what was painted", async () => {
    startMock.mockResolvedValue(operation());
    const { result } = renderFill();
    await waitFor(() => expect(result.current.presets).not.toBeNull());

    expect(result.current.generateBlocker).toBe("Paint over what to fill first.");
    paint(result);
    expect(result.current.canGenerate).toBe(true);

    act(() => result.current.setInstruction("a wooden bench"));
    act(() => result.current.generate());

    await waitFor(() => expect(startMock).toHaveBeenCalled());
    expect(startMock.mock.calls[0][1].instruction).toBe("a wooden bench");
  });

  it("stops at the number of fills one edit can hold", async () => {
    const full = Array.from({ length: 16 }, (_, index) =>
      makeImageFill({ id: index.toString(16).repeat(32) }),
    );
    const { result } = renderFill({ fills: full });
    await waitFor(() => expect(result.current.presets).not.toBeNull());
    paint(result);

    expect(result.current.canGenerate).toBe(false);
    expect(result.current.generateBlocker).toMatch(/at most 16 fills/);
  });

  it("steps the brush one slider notch at a time, within the slider's range", () => {
    const { result } = renderFill();
    const start = result.current.brushFraction;

    act(() => result.current.stepBrush(1));
    expect(result.current.brushFraction).toBeCloseTo(start + BRUSH_FRACTION_STEP);
    for (let step = 0; step < 100; step += 1) act(() => result.current.stepBrush(-1));
    expect(result.current.brushFraction).toBe(BRUSH_MIN_FRACTION);
    for (let step = 0; step < 100; step += 1) act(() => result.current.stepBrush(1));
    expect(result.current.brushFraction).toBeCloseTo(BRUSH_MAX_FRACTION);
  });

  it("undoes strokes one at a time", () => {
    const { result } = renderFill();
    paint(result);
    act(() => result.current.beginStroke({ x: 5, y: 5 }));

    act(() => result.current.undoStroke());

    expect(result.current.strokes).toHaveLength(1);
    expect(result.current.strokes[0].points).toEqual([
      { x: 100, y: 100 },
      { x: 140, y: 120 },
    ]);
  });

  it("ignores a late answer for a file the editor has left, and stops that run", async () => {
    const fill = makeImageFill({ id: "2".repeat(32) });
    startMock.mockResolvedValue(operation({ id: fill.id }));
    pollMock.mockResolvedValue(succeeded(fill));
    const { result, rerender, initial } = renderFill();
    paint(result);
    act(() => result.current.generate());
    await waitFor(() => expect(result.current.progress).toBe("queued"));

    rerender({ ...initial, path: OTHER });
    await poll();

    expect(cancelMock).toHaveBeenCalledWith(fill.id);
    expect(result.current.candidate).toBeNull();
    expect(result.current.progress).toBe("idle");
    expect(result.current.strokes).toEqual([]);
  });

  it("discards an undecided result when the editor leaves its file", async () => {
    const fill = makeImageFill({ id: "2".repeat(32) });
    startMock.mockResolvedValue(operation({ id: fill.id }));
    pollMock.mockResolvedValue(succeeded(fill));
    const { result, rerender, initial } = renderFill();
    paint(result);
    act(() => result.current.generate());
    await waitFor(() => expect(result.current.progress).toBe("queued"));
    await poll();
    expect(result.current.candidate).toEqual(fill);

    rerender({ ...initial, path: OTHER });

    await waitFor(() => expect(discardMock).toHaveBeenCalledWith(PHOTO, fill.id));
    expect(result.current.previewIds).toEqual([]);
  });

  it("reports a run the server no longer knows as interrupted", async () => {
    startMock.mockResolvedValue(operation());
    pollMock.mockRejectedValue(new ApiError(404, "gone"));
    const { result } = renderFill();
    paint(result);
    act(() => result.current.generate());
    await waitFor(() => expect(result.current.progress).toBe("queued"));

    await poll();

    expect(result.current.error).toBe(FILL_INTERRUPTED_MESSAGE);
    expect(result.current.generating).toBe(false);
    // The selection survives, so Generate is one click away.
    expect(result.current.strokes).toHaveLength(1);
  });

  it("shows ComfyUI's reason for a failed run", async () => {
    startMock.mockResolvedValue(operation());
    pollMock.mockResolvedValue(operation({ status: "failed", error: "KSampler: OOM" }));
    const { result } = renderFill();
    paint(result);
    act(() => result.current.generate());
    await waitFor(() => expect(result.current.progress).toBe("queued"));

    await poll();

    expect(result.current.error).toBe("KSampler: OOM");
    expect(result.current.candidate).toBeNull();
  });

  it("cancels the run it started", async () => {
    startMock.mockResolvedValue(operation());
    pollMock.mockResolvedValue(operation({ status: "running" }));
    const { result } = renderFill();
    paint(result);
    act(() => result.current.generate());
    await waitFor(() => expect(result.current.progress).toBe("queued"));

    act(() => result.current.cancel());

    await waitFor(() => expect(result.current.progress).toBe("cancelled"));
    expect(cancelMock).toHaveBeenCalledWith("op-1");
    expect(result.current.pending).toBe(false);
  });

  it("keeps the previous result until a regenerated one replaces it", async () => {
    const first = makeImageFill({ id: "2".repeat(32) });
    const second = makeImageFill({ id: "3".repeat(32) });
    startMock
      .mockResolvedValueOnce(operation({ id: first.id }))
      .mockResolvedValueOnce(operation({ id: second.id }));
    pollMock
      .mockResolvedValueOnce(succeeded(first))
      .mockResolvedValueOnce(operation({ id: second.id, status: "running" }))
      .mockResolvedValueOnce(succeeded(second));
    const { result } = renderFill();
    paint(result);
    act(() => result.current.generate());
    await waitFor(() => expect(result.current.progress).toBe("queued"));
    await poll();
    expect(result.current.candidate).toEqual(first);

    act(() => result.current.generate());
    await waitFor(() => expect(result.current.progress).toBe("queued"));
    await poll();
    expect(result.current.candidate).toEqual(first);

    await poll();

    expect(result.current.candidate).toEqual(second);
    expect(discardMock).toHaveBeenCalledWith(PHOTO, first.id);
  });

  it("refuses to keep a result whose parent fill was undone", async () => {
    const fill = makeImageFill({ id: "2".repeat(32), parent_id: KEPT.id });
    startMock.mockResolvedValue(operation({ id: fill.id }));
    pollMock.mockResolvedValue(succeeded(fill));
    const { result, rerender, initial, onKeep } = renderFill({ fills: [KEPT] });
    paint(result);
    act(() => result.current.generate());
    await waitFor(() => expect(result.current.progress).toBe("queued"));
    await poll();

    rerender({ ...initial, fills: [] });
    act(() => result.current.keep());

    expect(result.current.candidateStale).toBe(true);
    expect(onKeep).not.toHaveBeenCalled();
    // Its chain is gone, so the stage must not ask the server to composite it.
    expect(result.current.previewIds).toEqual([]);
  });

  it("reset stops the run, drops the result and clears the selection", async () => {
    startMock.mockResolvedValue(operation());
    pollMock.mockResolvedValue(operation({ status: "running" }));
    const { result } = renderFill();
    paint(result);
    act(() => result.current.generate());
    await waitFor(() => expect(result.current.progress).toBe("queued"));

    act(() => result.current.reset());

    expect(cancelMock).toHaveBeenCalledWith("op-1");
    expect(result.current.strokes).toEqual([]);
    expect(result.current.pending).toBe(false);
  });

  it("asks about presets only while the tool is open", async () => {
    const { result, rerender, initial } = renderFill({ open: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(presetsMock).not.toHaveBeenCalled();

    rerender({ ...initial, open: true });

    await waitFor(() => expect(result.current.presets).toHaveLength(2));
  });
});
