import { postJson, requestJson } from "@/shared/api/http";
import type {
  FillPresetsResponse,
  ImageFillOperationResponse,
  ImageFillRequest,
} from "@/shared/types";

const FILL_URL = "/api/media/image-fill";

export async function fetchFillPresets(): Promise<FillPresetsResponse> {
  return requestJson<FillPresetsResponse>(`${FILL_URL}/presets`);
}

export async function startImageFill(
  mediaPath: string,
  request: ImageFillRequest,
): Promise<ImageFillOperationResponse> {
  const params = new URLSearchParams({ path: mediaPath });
  return postJson<ImageFillOperationResponse>(`${FILL_URL}?${params}`, request);
}

export async function fetchFillOperation(operationId: string): Promise<ImageFillOperationResponse> {
  const params = new URLSearchParams({ id: operationId });
  return requestJson<ImageFillOperationResponse>(`${FILL_URL}/operation?${params}`);
}

export async function cancelFillOperation(
  operationId: string,
): Promise<ImageFillOperationResponse> {
  const params = new URLSearchParams({ id: operationId });
  return requestJson<ImageFillOperationResponse>(`${FILL_URL}/operation/cancel?${params}`, {
    method: "POST",
  });
}

/** Drops a result the user discarded; a kept one lives on in the draft until Apply archives it. */
export async function discardFillResult(mediaPath: string, fillId: string): Promise<void> {
  const params = new URLSearchParams({ path: mediaPath, id: fillId });
  await requestJson<void>(`${FILL_URL}/discard?${params}`, { method: "POST" });
}

/** The original with `fillIds` composited. Ids are unique per generation, so the URL is stable. */
export function fillPreviewUrl(mediaPath: string, fillIds: readonly string[]): string {
  const params = new URLSearchParams({ path: mediaPath, fills: fillIds.join(",") });
  return `${FILL_URL}/preview?${params}`;
}
