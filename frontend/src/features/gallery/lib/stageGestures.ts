import type { StageGesture } from "@/features/gallery/components/StageHint";
import { SHORTCUTS } from "@/shared/lib/shortcuts";

/** The keys a focused crop, mask or trim handle answers to. */
export const HANDLE_GESTURES: readonly StageGesture[] = [
  { shortcut: SHORTCUTS.nudgeHandle, does: "Nudge" },
  { shortcut: SHORTCUTS.nudgeHandleCoarse, does: "Bigger steps" },
];

/** A focused Adjust ruler takes the same keys as a handle. */
export const ADJUST_GESTURES: readonly StageGesture[] = [
  { shortcut: SHORTCUTS.nudgeHandle, does: "Turn the ruler" },
  { shortcut: SHORTCUTS.nudgeHandleCoarse, does: "Bigger steps" },
];

export const MASK_GESTURES: readonly StageGesture[] = [
  ...HANDLE_GESTURES,
  { shortcut: SHORTCUTS.removeMask, does: "Remove" },
];

export const TRIM_GESTURES: readonly StageGesture[] = [
  ...HANDLE_GESTURES,
  { keys: ["Home", "End"], does: "To the start or end" },
];
