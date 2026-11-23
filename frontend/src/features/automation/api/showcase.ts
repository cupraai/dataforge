import { queryOptions } from "@tanstack/react-query";
import type { SavedStore } from "@/features/automation/components/SavedMenu";
import { putJson, requestJson } from "@/shared/api/http";
import { fetchJobs } from "@/features/jobs/api/jobs";
import type {
  ComfyLorasResponse,
  ComfyShowcaseSet,
  ComfyShowcaseSetsResponse,
} from "@/shared/types";

const SETS_URL = "/api/automation/comfy-showcase/sets";

/** Read fresh on every open: a LoRA copied in a moment ago must show. */
export function comfyLorasQueryOptions() {
  return queryOptions({
    queryKey: ["comfy-loras"] as const,
    queryFn: ({ signal }) =>
      requestJson<ComfyLorasResponse>("/api/automation/comfy-showcase/loras", { signal }),
    staleTime: 0,
  });
}

export const showcaseSetsStore: SavedStore<ComfyShowcaseSetsResponse, ComfyShowcaseSet> = {
  queryKey: ["comfy-showcase-sets"],
  load: (signal) => requestJson<ComfyShowcaseSetsResponse>(SETS_URL, { signal }),
  entries: (response) => response.sets,
  save: (showcase) => putJson<ComfyShowcaseSetsResponse>(SETS_URL, showcase),
  remove: (name) =>
    requestJson<ComfyShowcaseSetsResponse>(`${SETS_URL}?${new URLSearchParams({ name })}`, {
      method: "DELETE",
    }),
};

/** Training runs in any folder, newest first: the runs a showcase compares saves of. */
export function trainingRunsQueryOptions() {
  return queryOptions({
    queryKey: ["jobs", "train_lora", "showcase"] as const,
    queryFn: ({ signal }) => fetchJobs({ jobTypes: ["train_lora"], limit: 100, signal }),
    staleTime: 30_000,
  });
}
