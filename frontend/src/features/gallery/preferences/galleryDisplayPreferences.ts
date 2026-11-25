import { normalizeFolderPath } from "@/features/folder/lib/folderPath";
import { isGalleryDisplayMode, parseDisplayMode } from "@/features/gallery/lib/displayMode";
import { isSortOption, parseSortOption, type SortOption } from "@/features/gallery/lib/query";
import { putJson, requestJson } from "@/shared/api/http";
import { readStoredJson, writeStoredJson } from "@/shared/lib/storage";
import type {
  GalleryDisplayMode,
  GalleryDisplaySettingsResponse,
  GalleryDisplaySettingsUpdate,
} from "@/shared/types";

/** How one folder's gallery is shown; each folder remembers its own. */
export interface GalleryView {
  mode: GalleryDisplayMode;
  sort: SortOption;
}

const CACHE_KEY = "gallery-views";
const CACHE_LIMIT = 50;

type ViewCache = Record<string, GalleryView>;

function cacheKeyFor(folderPath: string): string {
  return normalizeFolderPath(folderPath).toLowerCase();
}

function isGalleryView(value: unknown): value is GalleryView {
  if (typeof value !== "object" || value === null) return false;
  const { mode, sort } = value as Record<string, unknown>;
  return (
    typeof mode === "string" &&
    isGalleryDisplayMode(mode) &&
    typeof sort === "string" &&
    isSortOption(sort)
  );
}

function parseCache(value: unknown): ViewCache | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, GalleryView] =>
      isGalleryView(entry[1]),
    ),
  );
}

function readCache(): ViewCache {
  return readStoredJson<ViewCache>(CACHE_KEY, parseCache, {});
}

export function forgetCachedGalleryViews(): void {
  writeStoredJson(CACHE_KEY, {});
}

export function readCachedGalleryView(folderPath: string | undefined): GalleryView | null {
  if (!folderPath) return null;
  return readCache()[cacheKeyFor(folderPath)] ?? null;
}

function cacheGalleryView(folderPath: string, view: GalleryView): void {
  const key = cacheKeyFor(folderPath);
  const cache = readCache();
  // Re-inserting moves the folder to the end so the trim drops the least recently chosen.
  delete cache[key];
  cache[key] = view;

  const keys = Object.keys(cache);
  for (const stale of keys.slice(0, Math.max(0, keys.length - CACHE_LIMIT))) {
    delete cache[stale];
  }

  writeStoredJson(CACHE_KEY, cache);
}

function viewFromWire(data: GalleryDisplaySettingsResponse): GalleryView {
  return { mode: parseDisplayMode(data.mode), sort: parseSortOption(data.sort) };
}

export async function fetchGalleryView(folderPath: string): Promise<GalleryView> {
  const params = new URLSearchParams({ path: folderPath });
  const view = viewFromWire(
    await requestJson<GalleryDisplaySettingsResponse>(`/api/preferences/gallery-display?${params}`),
  );
  cacheGalleryView(folderPath, view);
  return view;
}

/** `view` is the whole view as now shown, so the mirror holds it before the save returns. */
export async function updateGalleryView(
  folderPath: string,
  view: GalleryView,
  change: Partial<GalleryView>,
): Promise<GalleryView> {
  cacheGalleryView(folderPath, view);

  const body: GalleryDisplaySettingsUpdate = { ...change, folder_path: folderPath };
  const saved = viewFromWire(
    await putJson<GalleryDisplaySettingsResponse>("/api/preferences/gallery-display", body),
  );
  cacheGalleryView(folderPath, saved);
  return saved;
}
