import { useQuery } from "@tanstack/react-query";
import { comfyPresetsQueryOptions } from "@/features/automation/lib/automationQueries";
import { presetBelongsTo } from "@/features/automation/hooks/useComfyPresetForm";

/** Whether each ComfyUI job has a preset to offer. */
export function useComfyPresetsAvailable(): { edit: boolean; generate: boolean } {
  const { data } = useQuery(comfyPresetsQueryOptions());
  const presets = data?.presets ?? [];
  return {
    edit: presets.some((preset) => presetBelongsTo(preset, "edit")),
    generate: presets.some((preset) => presetBelongsTo(preset, "generate")),
  };
}
