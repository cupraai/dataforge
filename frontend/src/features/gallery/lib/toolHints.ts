import { SHORTCUTS, type ShortcutDefinition } from "@/shared/lib/shortcuts";

/** A registered shortcut, bare key names, or a mouse gesture written out, and what it does. */
export type StageGesture = { does: string } & (
  { shortcut: ShortcutDefinition } | { keys: readonly string[] } | { gesture: string }
);

export interface ToolHintEntry {
  message: string;
  gestures?: readonly StageGesture[];
}

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

// The tools more than one editor shares, worded once.

export const CROP_HINT: ToolHintEntry = {
  message: "Drag the frame or its handles on the picture, or pick a ratio.",
  gestures: HANDLE_GESTURES,
};

export const SIZE_HINT: ToolHintEntry = {
  message: "Pick a scale, or type a width or height; the other follows.",
};

export const BLUR_HINT: ToolHintEntry = {
  message: "Add a region, then drag it over what to hide.",
  gestures: [...HANDLE_GESTURES, { shortcut: SHORTCUTS.removeMask, does: "Remove" }],
};

export const TRIM_HINT: ToolHintEntry = {
  message: "Both follow the playhead. Drag a handle, or focus it and use the keys.",
  gestures: [...HANDLE_GESTURES, { keys: ["Home", "End"], does: "To the start or end" }],
};
