import { useQuery } from "@tanstack/react-query";
import { fetchModelInfo } from "@/features/gallery/api/modelInfo";
import { mediaCacheKey } from "@/features/gallery/lib/thumbnail";
import { formatApiError } from "@/shared/api/http";
import type { GalleryItem, ModelInfoResponse } from "@/shared/types";

export type ModelInfoState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; info: ModelInfoResponse };

/** The header of the model being viewed; keyed by its stat so a replaced file is read again. */
export function useModelInfo(
  item: Pick<GalleryItem, "path" | "modified_at" | "size"> | null,
): ModelInfoState {
  const { data, error, isError } = useQuery({
    queryKey: ["model-info", item?.path, mediaCacheKey(item?.modified_at, item?.size)],
    queryFn: () => fetchModelInfo(item!.path),
    enabled: item !== null,
    // A header that cannot be read now will not read on a retry either.
    retry: false,
  });

  if (isError) return { status: "error", message: formatApiError(error) };
  if (data) return { status: "ready", info: data };
  return { status: "loading" };
}
