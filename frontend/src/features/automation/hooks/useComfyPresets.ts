import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  comfyPresetsQueryOptions,
  refreshComfyPresets,
} from "@/features/automation/lib/automationQueries";
import { formatApiError } from "@/shared/api/http";
import { useOptionalServerEvent } from "@/shared/events/serverEvents";
import type { ComfyPresetSummary } from "@/shared/types";

/** Which ComfyUI job lists a preset: edit presets load a source file, generate presets do not;
 * a showcase takes any preset it can add LoRAs to. */
export type ComfyPresetKind = "edit" | "generate" | "showcase";

/** Lists a preset under one job. An unparseable preset (null) lists under both, so queueing it
 * names the fix. */
export function presetBelongsTo(preset: ComfyPresetSummary, kind: ComfyPresetKind): boolean {
  if (kind === "showcase") return preset.accepts_loras !== false;
  return kind === "generate" ? preset.generates !== false : preset.generates !== true;
}

export type PresetsState =
  | { status: "loading" }
  | { status: "ready"; presets: ComfyPresetSummary[]; available: boolean; baseUrl: string }
  | { status: "error"; message: string };

/** One job's presets, live while the presets folder changes. */
export function useComfyPresetList(kind: ComfyPresetKind): PresetsState {
  const query = useQuery(comfyPresetsQueryOptions());
  // A failed refresh leaves the last list usable.
  if (query.data) {
    return {
      status: "ready",
      presets: query.data.presets.filter((entry) => presetBelongsTo(entry, kind)),
      available: query.data.available,
      baseUrl: query.data.base_url,
    };
  }
  return query.isError
    ? { status: "error", message: formatApiError(query.error) }
    : { status: "loading" };
}

/** Keeps every open preset list in step with the presets folder. */
export function useLiveComfyPresets(): void {
  const queryClient = useQueryClient();
  useOptionalServerEvent((event) => {
    if (event.type === "comfy_presets") void refreshComfyPresets(queryClient);
  });
}

/** Whether each ComfyUI job has a preset to offer. */
export function useComfyPresetsAvailable(): {
  edit: boolean;
  generate: boolean;
  showcase: boolean;
} {
  const { data } = useQuery(comfyPresetsQueryOptions());
  const presets = data?.presets ?? [];
  return {
    edit: presets.some((preset) => presetBelongsTo(preset, "edit")),
    generate: presets.some((preset) => presetBelongsTo(preset, "generate")),
    showcase: presets.some((preset) => presetBelongsTo(preset, "showcase")),
  };
}
