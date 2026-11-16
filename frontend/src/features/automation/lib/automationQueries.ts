import { queryOptions } from "@tanstack/react-query";
import {
  fetchComfyPresetMap,
  fetchComfyPresets,
  fetchWatermarkImageInfo,
} from "@/features/automation/api/jobs";
import { fetchSystemSpecs } from "@/features/automation/api/system";

/** Reads shared by more than one reader, kept with their keys so the readers cannot drift. */
export function systemSpecsQueryOptions() {
  return queryOptions({ queryKey: ["system-specs"], queryFn: fetchSystemSpecs });
}

export function comfyPresetsQueryOptions() {
  return queryOptions({
    queryKey: ["comfy-presets"],
    queryFn: ({ signal }) => fetchComfyPresets(signal),
    // An unreachable ComfyUI answers `available: false`; the backend being down is a failure
    // each reader reports at once.
    retry: false,
  });
}

/** One preset's workflow map, read again on each open since presets are edited on disk. */
export function comfyPresetMapQueryOptions(name: string) {
  return queryOptions({
    queryKey: ["comfy-preset-map", name],
    queryFn: ({ signal }) => fetchComfyPresetMap(name, signal),
    retry: false,
  });
}

/** Read by the Watermark dialog, and written from the upload's response. */
export function watermarkImageQueryOptions() {
  return queryOptions({
    queryKey: ["watermark-image"],
    queryFn: ({ signal }) => fetchWatermarkImageInfo(signal),
  });
}
