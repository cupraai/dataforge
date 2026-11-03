import { useEffect, useState } from "react";
import type { ImageFillControls } from "@/features/gallery/hooks/useImageFill";
import { fillStatus, type FillStatusKind } from "@/features/gallery/lib/fillStatus";
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
import { SHORTCUTS } from "@/shared/lib/shortcuts";
import { StageHint, type StageGesture, type StageHintTone } from "./StageHint";

const LOOKS: Record<FillStatusKind, { icon: AppIcon; tone: StageHintTone }> = {
  paint: { icon: iconPencilLine, tone: "info" },
  ready: { icon: iconWandSparkles, tone: "info" },
  busy: { icon: iconLoader2, tone: "busy" },
  result: { icon: iconCircleCheck, tone: "done" },
  warning: { icon: iconTriangleAlert, tone: "warning" },
  error: { icon: iconCircleAlert, tone: "error" },
};

const GESTURES: Partial<Record<FillStatusKind, readonly StageGesture[]>> = {
  paint: [
    { shortcut: SHORTCUTS.fillBrush, does: "Brush" },
    { shortcut: SHORTCUTS.fillEraser, does: "Eraser" },
    { keys: ["[", "]"], does: "Size" },
    { gesture: "Wheel", does: "Zoom" },
    { gesture: "Middle-drag", does: "Pan" },
  ],
  ready: [{ keys: ["Enter"], does: "Generate" }],
};

/** Whole seconds since `running` turned on; 0 while it is off. */
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
  return running ? elapsed : 0;
}

/** The Fill tool's next step: what to do, a run's progress, or why Generate is off. */
export function FillStatusBar({ fill }: { fill: ImageFillControls }) {
  const status = fillStatus(fill);
  const elapsed = useElapsedSeconds(status.kind === "busy");
  const look = LOOKS[status.kind];

  return (
    <StageHint
      icon={look.icon}
      tone={look.tone}
      message={status.message}
      gestures={GESTURES[status.kind]}
      status
      aside={
        // Outside the status: one read out every second drowns everything else.
        status.kind === "busy" && elapsed > 0 ? (
          <span className="stage-hint__elapsed" aria-hidden="true">
            {elapsed} s
          </span>
        ) : undefined
      }
    />
  );
}
