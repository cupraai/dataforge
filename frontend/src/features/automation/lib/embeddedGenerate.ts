import type { EmbeddedGenerateWorkflow } from "@/features/automation/types";
import type { ComfyPresetSummary } from "@/shared/types";

/** The file's name without its extension: what the dialog calls its workflow. */
export function embeddedWorkflowName(embedded: EmbeddedGenerateWorkflow): string {
  const dot = embedded.mediaName.lastIndexOf(".");
  return dot > 0 ? embedded.mediaName.slice(0, dot) : embedded.mediaName;
}

/** What new files are named after; the backend trims the same separators off the stem. */
export function embeddedNamePrefix(embedded: EmbeddedGenerateWorkflow): string {
  return embeddedWorkflowName(embedded).replace(/[_ .]+$/, "") || "generated";
}

/** The workflow as the one entry the preset list shows. */
export function embeddedPresetSummary(embedded: EmbeddedGenerateWorkflow): ComfyPresetSummary {
  return {
    name: embeddedWorkflowName(embedded),
    accepts_prompt: embedded.generation.accepts_prompt,
    accepts_seed: embedded.generation.accepts_seed,
    inputs: embedded.generation.inputs,
    generates: true,
  };
}
