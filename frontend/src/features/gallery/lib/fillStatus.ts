import type { FillProgress, ImageFillControls } from "@/features/gallery/hooks/useImageFill";

const PROGRESS_LABELS: Partial<Record<FillProgress, string>> = {
  starting: "Preparing the selection...",
  waiting: "Waiting for another ComfyUI job...",
  queued: "Queued in ComfyUI...",
  running: "Generating...",
};

/** What the hint row says: progress, the reason Generate is off, or how to start. */
export function fillStatusText(fill: ImageFillControls): string {
  const progress = PROGRESS_LABELS[fill.progress];
  if (progress) return progress;
  if (fill.error) return fill.error;
  if (fill.candidate) {
    return fill.candidateStale
      ? "The kept fills changed since this was generated. Discard it and generate again."
      : "Compare, then keep the fill or discard it. Apply saves kept fills to the file.";
  }
  if (fill.presetsError) return `Could not check ComfyUI: ${fill.presetsError}`;
  return (
    fill.generateBlocker ??
    "Leave the instruction blank to remove what you painted, or say what should appear there."
  );
}
