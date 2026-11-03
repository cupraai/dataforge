import { useEffect, useState } from "react";
import {
  FILL_NEEDS_PAINT,
  type FillProgress,
  type ImageFillControls,
} from "@/features/gallery/hooks/useImageFill";
import type { StageGesture } from "@/features/gallery/lib/toolHints";
import { useChanged } from "@/shared/hooks/useChanged";
import {
  iconCircleAlert,
  iconCircleCheck,
  iconLoader2,
  iconPencilLine,
  iconTriangleAlert,
  iconWandSparkles,
  type AppIcon,
} from "@/shared/icons";
import { formatDurationSeconds } from "@/shared/lib/format";
import { SHORTCUTS } from "@/shared/lib/shortcuts";
import { StageHint, type StageHintTone } from "./StageHint";

interface FillStatus {
  icon: AppIcon;
  tone: StageHintTone;
  message: string;
  gestures?: readonly StageGesture[];
}

const PROGRESS_LABELS: Partial<Record<FillProgress, string>> = {
  starting: "Preparing the selection...",
  waiting: "Waiting for another ComfyUI job...",
  queued: "Queued in ComfyUI...",
  running: "Generating...",
};

const PAINT_GESTURES: readonly StageGesture[] = [
  { shortcut: SHORTCUTS.fillBrush, does: "Brush" },
  { shortcut: SHORTCUTS.fillEraser, does: "Eraser" },
  { shortcut: SHORTCUTS.fillBrushSize, does: "Size" },
  { gesture: "Wheel", does: "Zoom" },
  { gesture: "Middle-drag", does: "Pan" },
];

/** Progress first, then a failure, a result waiting for a decision, the reason Generate is
 * off, and otherwise the next step of the request. */
function fillStatus(fill: ImageFillControls): FillStatus {
  const progress = PROGRESS_LABELS[fill.progress];
  if (progress) return { icon: iconLoader2, tone: "busy", message: progress };
  if (fill.error) return { icon: iconCircleAlert, tone: "error", message: fill.error };
  if (fill.candidate) {
    return fill.candidateStale
      ? {
          icon: iconTriangleAlert,
          tone: "warning",
          message:
            "The kept fills changed since this was generated. Discard it and generate again.",
        }
      : {
          icon: iconCircleCheck,
          tone: "done",
          message: "Keep the fill or discard it. Hold the picture to see it before.",
        };
  }
  if (fill.presetsError) {
    return {
      icon: iconTriangleAlert,
      tone: "warning",
      message: `Could not check ComfyUI: ${fill.presetsError}`,
    };
  }
  // The empty selection is the first step, not a fault.
  if (fill.generateBlocker === FILL_NEEDS_PAINT) {
    return {
      icon: iconPencilLine,
      tone: "info",
      message: FILL_NEEDS_PAINT,
      gestures: PAINT_GESTURES,
    };
  }
  if (fill.generateBlocker) {
    return { icon: iconTriangleAlert, tone: "warning", message: fill.generateBlocker };
  }
  return {
    icon: iconWandSparkles,
    tone: "info",
    message: "Say what goes there, or leave the instruction blank to remove it.",
    gestures: [{ keys: ["Enter"], does: "Generate" }],
  };
}

/** Whole seconds since `running` last turned on. */
function useElapsedSeconds(running: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  if (useChanged(running)) setElapsed(0);
  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [running]);
  return elapsed;
}

/** The Fill tool's next step: what to do, a run's progress, or why Generate is off. */
export function FillStatusBar({ fill }: { fill: ImageFillControls }) {
  const status = fillStatus(fill);
  const busy = status.tone === "busy";
  const elapsed = useElapsedSeconds(busy);

  return (
    <StageHint
      {...status}
      status
      aside={
        // Outside the status: one read out every second drowns everything else.
        busy && elapsed > 0 ? (
          <span className="stage-hint__elapsed" aria-hidden="true">
            {formatDurationSeconds(elapsed)}
          </span>
        ) : undefined
      }
    />
  );
}
