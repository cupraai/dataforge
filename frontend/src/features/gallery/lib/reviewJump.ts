import { isCaptionable } from "@/features/gallery/lib/itemKind";
import type { GalleryItem } from "@/shared/types";

/** A model file takes no caption, so the jump never stops on one. */
export function isUncaptionedItem(item: GalleryItem): boolean {
  return !item.has_description && isCaptionable(item);
}

/** The nearest other match, wrapping; -1 when none. The current item never counts. */
export function nextIndexWhere(
  items: readonly GalleryItem[],
  index: number,
  predicate: (item: GalleryItem) => boolean,
  direction: 1 | -1,
): number {
  for (let step = 1; step < items.length; step++) {
    const candidate = (index + direction * step + items.length) % items.length;
    if (predicate(items[candidate])) return candidate;
  }
  return -1;
}
