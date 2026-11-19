import { isModel } from "@/features/gallery/lib/itemKind";
import { filterBySearch, sortGalleryItems, type SortOption } from "@/features/gallery/lib/query";
import type { GalleryItem } from "@/shared/types";

/** Media for the gallery grid, model files for their own section; the listing carries both. */
export function splitModels(items: readonly GalleryItem[]): {
  media: GalleryItem[];
  models: GalleryItem[];
} {
  const media: GalleryItem[] = [];
  const models: GalleryItem[] = [];
  for (const item of items) (isModel(item) ? models : media).push(item);
  return { media, models };
}

export interface ModelQuery {
  searchQuery: string;
  searchRegex: boolean;
  searchNames: boolean;
  /** Names a regex search matched, worked out in a worker; `null` tests the pattern here. */
  regexMatches?: ReadonlySet<string> | null;
  sort: SortOption;
}

/** Models match by name only; caption-only search leaves them; filters do not apply. */
export function processModels(models: readonly GalleryItem[], query: ModelQuery): GalleryItem[] {
  const searched = query.searchNames
    ? filterBySearch([...models], query.searchQuery, query.searchRegex, true, query.regexMatches)
    : [...models];
  return sortGalleryItems(searched, query.sort);
}
