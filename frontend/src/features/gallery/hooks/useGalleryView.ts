import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { folderKey } from "@/features/folder/lib/folderPath";
import { DEFAULT_DISPLAY_MODE } from "@/features/gallery/lib/displayMode";
import { DEFAULT_SORT, type SortOption } from "@/features/gallery/lib/query";
import {
  fetchGalleryView,
  readCachedGalleryView,
  updateGalleryView,
  type GalleryView,
} from "@/features/gallery/preferences/galleryDisplayPreferences";
import type { GalleryDisplayMode } from "@/shared/types";
import { mirroredPreference } from "@/shared/query/refreshPolicies";

const DEFAULT_VIEW: GalleryView = { mode: DEFAULT_DISPLAY_MODE, sort: DEFAULT_SORT };

export const ALL_GALLERY_VIEWS_KEY = ["gallery-view"] as const;
export const galleryViewKey = (folderPath: string) =>
  [...ALL_GALLERY_VIEWS_KEY, folderKey(folderPath)] as const;

/** Display mode and sort, remembered per folder. Cached folders paint at once from the mirror. */
export function useGalleryView(folderPath: string | undefined) {
  const queryClient = useQueryClient();
  const path = folderPath ?? "";

  const { data } = useQuery({
    queryKey: galleryViewKey(path),
    queryFn: () => fetchGalleryView(path),
    enabled: Boolean(folderPath),
    ...mirroredPreference(() => readCachedGalleryView(folderPath) ?? undefined),
  });
  const view = (folderPath && data) || DEFAULT_VIEW;

  const { mutate } = useMutation({
    mutationFn: ({
      path,
      next,
      change,
    }: {
      path: string;
      next: GalleryView;
      change: Partial<GalleryView>;
    }) => updateGalleryView(path, next, change),
    onMutate: async ({ path, next }) => {
      await queryClient.cancelQueries({ queryKey: galleryViewKey(path) });
      queryClient.setQueryData(galleryViewKey(path), next);
    },
    // Only the fields this save changed: a reply can predate a quicker change to the other.
    // The choice stays applied and mirrored locally even when the save fails.
    onSuccess: (saved, { path, change }) => {
      const confirmed: Partial<GalleryView> = {};
      if (change.mode !== undefined) confirmed.mode = saved.mode;
      if (change.sort !== undefined) confirmed.sort = saved.sort;
      queryClient.setQueryData<GalleryView>(galleryViewKey(path), (current) => ({
        ...(current ?? saved),
        ...confirmed,
      }));
    },
  });

  const change = useCallback(
    (partial: Partial<GalleryView>) => {
      if (!folderPath) return;
      // Read at call time: two quick changes must not overwrite each other's half.
      const current =
        queryClient.getQueryData<GalleryView>(galleryViewKey(folderPath)) ?? DEFAULT_VIEW;
      mutate({ path: folderPath, next: { ...current, ...partial }, change: partial });
    },
    [folderPath, mutate, queryClient],
  );

  const setDisplayMode = useCallback((mode: GalleryDisplayMode) => change({ mode }), [change]);
  const setSort = useCallback((sort: SortOption) => change({ sort }), [change]);

  return { displayMode: view.mode, setDisplayMode, sort: view.sort, setSort };
}
