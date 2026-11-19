import { normalizeFolderPath } from "@/features/folder/lib/folderPath";
import { readStoredJson, writeStoredJson } from "@/shared/lib/storage";

const CACHE_KEY = "folder-grid-expanded";
const CACHE_LIMIT = 50;

function cacheKeyFor(folderPath: string): string {
  return normalizeFolderPath(folderPath).toLowerCase();
}

function parseCache(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((entry): entry is string => typeof entry === "string");
}

// Only expanded folders are stored; a missing entry reads as collapsed.
function readCache(): string[] {
  return readStoredJson<string[]>(CACHE_KEY, parseCache, []);
}

export function readFolderExpanded(folderPath: string | undefined): boolean {
  if (!folderPath) return false;
  return readCache().includes(cacheKeyFor(folderPath));
}

export function writeFolderExpanded(folderPath: string | undefined, expanded: boolean): void {
  if (!folderPath) return;

  const key = cacheKeyFor(folderPath);
  // Re-inserting moves the folder to the end, so the trim sheds the least recent.
  const kept = readCache().filter((entry) => entry !== key);
  if (expanded) kept.push(key);

  writeStoredJson(CACHE_KEY, kept.slice(Math.max(0, kept.length - CACHE_LIMIT)));
}
