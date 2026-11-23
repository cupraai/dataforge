import { queryOptions, type QueryClient } from "@tanstack/react-query";
import {
  fetchComfyPresets,
  fetchComfyWorkflowMap,
  fetchWatermarkImageInfo,
} from "@/features/automation/api/jobs";
import { fetchSystemSpecs } from "@/features/automation/api/system";
import type { ComfyWorkflowMapRequest } from "@/shared/types";

/** Reads shared by more than one reader, kept with their keys so the readers cannot drift. */
export function systemSpecsQueryOptions() {
  return queryOptions({ queryKey: ["system-specs"], queryFn: fetchSystemSpecs });
}

export function comfyPresetsQueryOptions() {
  return queryOptions({
    queryKey: ["comfy-presets"],
    queryFn: ({ signal }) => fetchComfyPresets(signal),
    meta: { pushFed: true },
    // An unreachable ComfyUI answers `available: false`; a down backend fails at once.
    retry: false,
  });
}

/** A workflow's map as it would run with the request's inputs. */
export function comfyWorkflowMapQueryOptions(request: ComfyWorkflowMapRequest) {
  return queryOptions({
    queryKey: ["comfy-workflow-map", request],
    queryFn: ({ signal }) => fetchComfyWorkflowMap(request, signal),
    meta: { pushFed: true },
    retry: false,
  });
}

/** Reads the presets again after their folder changed. The list first, so a dialog has let go
 * of a removed preset before its map is asked for. */
export async function refreshComfyPresets(client: QueryClient): Promise<void> {
  await client.invalidateQueries({ queryKey: comfyPresetsQueryOptions().queryKey });
  await client.invalidateQueries({ queryKey: ["comfy-workflow-map"] });
}

/** Read by the Watermark dialog, and written from the upload's response. */
export function watermarkImageQueryOptions() {
  return queryOptions({
    queryKey: ["watermark-image"],
    queryFn: ({ signal }) => fetchWatermarkImageInfo(signal),
  });
}
