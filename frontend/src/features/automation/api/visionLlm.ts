import { requestJson } from "@/shared/api/http";
import type { ReasoningEffort, VisionLlmInfoResponse } from "@/shared/types";

export const VISION_MODEL_QUERY_KEY = ["vision-model"] as const;

export interface VisionLlmInfo {
  /** The configured model id, sent with every request. */
  model: string;
  /** The server asked, named when it does not answer. */
  baseUrl: string;
  /** What the server reports serving for it; null when it cannot tell. */
  servedModel: string | null;
  /** Weakest first; empty when the chat template reads no level, null when unknown. */
  reasoningEfforts: readonly ReasoningEffort[] | null;
  /** Why no served model could be named, such as a refused API key. */
  detail: string | null;
  /** False when the server did not answer at all, so no job can start. */
  reachable: boolean;
}

/** Asks the vision server, so a model swapped on the server shows on the next read. */
export async function fetchVisionLlmInfo(): Promise<VisionLlmInfo> {
  const data = await requestJson<VisionLlmInfoResponse>("/api/system/vision-llm");
  return {
    model: data.model,
    baseUrl: data.base_url,
    servedModel: data.served_model ?? null,
    reasoningEfforts: data.reasoning_efforts ?? null,
    detail: data.detail ?? null,
    reachable: data.reachable !== false,
  };
}

/** A llama.cpp id may be the model's file path; the file name without `.gguf` reads better. */
export function visionModelLabel(info: VisionLlmInfo): string {
  const id = info.servedModel ?? info.model;
  if (!/\.gguf$/i.test(id)) return id;
  return id.replace(/^.*[\\/]/, "").replace(/\.gguf$/i, "");
}
