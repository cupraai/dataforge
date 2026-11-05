import { requestJson } from "@/shared/api/http";
import type { ModelInfoResponse } from "@/shared/types";

export async function fetchModelInfo(modelPath: string): Promise<ModelInfoResponse> {
  const params = new URLSearchParams({ path: modelPath });
  return requestJson<ModelInfoResponse>(`/api/media/model-info?${params}`);
}
