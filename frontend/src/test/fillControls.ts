import { vi } from "vitest";
import type { ImageFillControls } from "@/features/gallery/hooks/useImageFill";
import { BRUSH_DEFAULT_FRACTION } from "@/features/gallery/lib/fillMask";
import type { BrushMode, FillPoint } from "@/features/gallery/lib/fillMask";
import type { FillPreset, ImageFill } from "@/shared/types";

export function makeFillControls(overrides: Partial<ImageFillControls> = {}): ImageFillControls {
  return {
    strokes: [],
    brushMode: "paint",
    setBrushMode: vi.fn<(mode: BrushMode) => void>(),
    brushFraction: BRUSH_DEFAULT_FRACTION,
    setBrushFraction: vi.fn<(fraction: number) => void>(),
    stepBrush: vi.fn<(direction: 1 | -1) => void>(),
    brushRadius: 32,
    beginStroke: vi.fn<(point: FillPoint) => void>(),
    extendStroke: vi.fn<(point: FillPoint) => void>(),
    undoStroke: vi.fn<() => void>(),
    clearStrokes: vi.fn<() => void>(),
    canPaint: true,
    instruction: "",
    setInstruction: vi.fn<(text: string) => void>(),
    preset: "quality",
    setPreset: vi.fn<(preset: FillPreset) => void>(),
    presets: null,
    presetsLoading: false,
    presetsError: null,
    refreshPresets: vi.fn<() => void>(),
    progress: "idle",
    generating: false,
    error: null,
    canGenerate: false,
    generateBlocker: "Paint over what to fill first.",
    generate: vi.fn<() => void>(),
    cancel: vi.fn<() => void>(),
    candidate: null,
    candidateStale: false,
    showBefore: false,
    setShowBefore: vi.fn<(showBefore: boolean) => void>(),
    keep: vi.fn<() => void>(),
    discard: vi.fn<() => void>(),
    pending: false,
    previewIds: [],
    reset: vi.fn<() => void>(),
    reportPreviewError: vi.fn<() => void>(),
    ...overrides,
  };
}

export function makeImageFill(overrides: Partial<ImageFill> = {}): ImageFill {
  return {
    id: "a".repeat(32),
    parent_id: null,
    source_digest: "0".repeat(64),
    box: { left: 0, top: 0, width: 400, height: 300 },
    inference_width: 1024,
    inference_height: 768,
    instruction: "",
    preset: "quality",
    seed: 7,
    workflow: "qwen21_fill_quality@test",
    created_at: "2026-11-02T00:00:00+00:00",
    ...overrides,
  };
}
