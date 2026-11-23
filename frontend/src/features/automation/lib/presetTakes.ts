import type { ComfyPresetSummary } from "@/shared/types";

/** What a preset takes from the dialog, so the list says it before the preset is chosen. */
export function presetTakes(entry: ComfyPresetSummary): string {
  if (entry.generates === null) return "Could not be read";
  const parts: string[] = [];
  if (entry.accepts_prompt) parts.push("Prompt");
  if (entry.accepts_seed) parts.push("Seed");
  if (entry.inputs.length > 0) {
    parts.push(entry.inputs.length === 1 ? "1 input" : `${entry.inputs.length} inputs`);
  }
  return parts.length > 0 ? parts.join(" · ") : "Runs as saved";
}
