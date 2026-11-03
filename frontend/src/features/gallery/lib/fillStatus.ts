import {
  FILL_NEEDS_PAINT,
  type FillProgress,
  type ImageFillControls,
} from "@/features/gallery/hooks/useImageFill";

/**
 * `paint` and `ready` are the two steps of a request, each with its own keys; `busy` is a run;
 * `result` waits for Keep or Discard; `warning` and `error` stop the next step.
 */
export type FillStatusKind = "paint" | "ready" | "busy" | "result" | "warning" | "error";

export interface FillStatus {
  kind: FillStatusKind;
  message: string;
}

const PROGRESS_LABELS: Partial<Record<FillProgress, string>> = {
  starting: "Preparing the selection...",
  waiting: "Waiting for another ComfyUI job...",
  queued: "Queued in ComfyUI...",
  running: "Generating...",
};

/** What the stage's status bar says: progress, the reason Generate is off, or the next step. */
export function fillStatus(fill: ImageFillControls): FillStatus {
  const progress = PROGRESS_LABELS[fill.progress];
  if (progress) return { kind: "busy", message: progress };
  if (fill.error) return { kind: "error", message: fill.error };
  if (fill.candidate) {
    return fill.candidateStale
      ? {
          kind: "warning",
          message:
            "The kept fills changed since this was generated. Discard it and generate again.",
        }
      : {
          kind: "result",
          message: "Keep the fill or discard it. Hold the picture to see it before.",
        };
  }
  if (fill.presetsError) {
    return { kind: "warning", message: `Could not check ComfyUI: ${fill.presetsError}` };
  }
  if (fill.generateBlocker === FILL_NEEDS_PAINT)
    return { kind: "paint", message: FILL_NEEDS_PAINT };
  if (fill.generateBlocker) return { kind: "warning", message: fill.generateBlocker };
  return {
    kind: "ready",
    message: "Say what goes there, or leave the instruction blank to remove it.",
  };
}
