import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  comfyPresetsQueryOptions,
  refreshComfyPresets,
} from "@/features/automation/lib/automationQueries";
import { formatApiError } from "@/shared/api/http";
import { useOptionalServerEvent } from "@/shared/events/serverEvents";
import type { ComfyPresetSummary } from "@/shared/types";

/** Which presets a list offers: `run` every one, `edit` those that load a source file (a
 * workflow step), `showcase` any it can add LoRAs to. */
export type ComfyPresetKind = "run" | "edit" | "showcase";

/** An unparseable preset (null) lists everywhere, so queueing it names the fix. */
export function presetBelongsTo(preset: ComfyPresetSummary, kind: ComfyPresetKind): boolean {
  if (kind === "showcase") return preset.accepts_loras !== false;
  return kind === "run" || preset.generates !== true;
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

/** Whether each preset list has a preset to offer. */
export function useComfyPresetsAvailable(): Record<ComfyPresetKind, boolean> {
  const { data } = useQuery(comfyPresetsQueryOptions());
  const presets = data?.presets ?? [];
  return {
    run: presets.length > 0,
    edit: presets.some((preset) => presetBelongsTo(preset, "edit")),
    showcase: presets.some((preset) => presetBelongsTo(preset, "showcase")),
  };
}
