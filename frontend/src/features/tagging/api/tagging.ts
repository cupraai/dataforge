import { queryOptions } from "@tanstack/react-query";
import { putJson, requestJson } from "@/shared/api/http";
import type {
  TaggingRetagResponse,
  TaggingStatusResponse,
  TagVocabularyResponse,
} from "@/shared/types";

export const TAGGING_STATUS_QUERY_KEY = ["tagging-status"] as const;
export const TAG_VOCABULARY_QUERY_KEY = ["tag-vocabulary"] as const;

export function fetchTaggingStatus(signal?: AbortSignal): Promise<TaggingStatusResponse> {
  return requestJson<TaggingStatusResponse>("/api/system/tagging", { signal });
}

/** Kept current by `tagging` events; a reader that needs the per-file count polls on its own. */
export function taggingStatusQueryOptions() {
  return queryOptions({
    queryKey: TAGGING_STATUS_QUERY_KEY,
    queryFn: ({ signal }) => fetchTaggingStatus(signal),
    meta: { pushFed: true },
    staleTime: Infinity,
  });
}

/** Every tagged file goes back to the model; its old tags stay shown until replaced. */
export function retagEverything(): Promise<TaggingRetagResponse> {
  return requestJson<TaggingRetagResponse>("/api/system/tagging/retag", { method: "POST" });
}

export function fetchTagVocabulary(signal?: AbortSignal): Promise<TagVocabularyResponse> {
  return requestJson<TagVocabularyResponse>("/api/system/tagging/vocabulary", { signal });
}

/** Blank deletes the file; the terms apply to files tagged from then on. */
export function saveTagVocabulary(text: string): Promise<TagVocabularyResponse> {
  return putJson<TagVocabularyResponse>("/api/system/tagging/vocabulary", { text });
}
