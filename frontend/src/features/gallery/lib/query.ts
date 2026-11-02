import { isResolvableIssueItem } from "./issues";
import { isDuplicateItem } from "./duplicates";
import { isCandidateItem } from "./candidateReview";
import { isUncaptionedItem } from "./reviewJump";
import { isAudio, isMotion, isVideo } from "@/features/gallery/lib/itemKind";
import { SEARCH_REGEX_FLAGS, compileSearchRegex } from "@/features/gallery/lib/regexSearch";
import { DEFAULT_GALLERY_SORT } from "@/shared/constants";
import { durationSeconds } from "@/shared/lib/format";
import type { GalleryItem, GallerySort, MediaTag, Subfolder } from "@/shared/types";

export type SortOption = GallerySort;

export type ItemFilter = "all" | "captioned" | "issue" | "uncaptioned";

/** video means has motion, so it covers GIFs as well as MP4s. */
export type MediaTypeFilter = "all" | "image" | "video" | "audio";

export type FileFilter = "all" | "edited" | "duplicates" | "candidates";

/** Megapixels, seconds of video, and characters of a text caption. */
export type RangeAxis = "megapixels" | "duration" | "caption_length";

/** `min <= value < max`, the way Statistics buckets values; `null` leaves a side open. */
export interface GalleryRange {
  min?: number | null;
  max?: number | null;
}

/** A file without an axis's value, e.g. a still for duration, never matches that axis. */
export type GalleryRanges = Partial<Record<RangeAxis, GalleryRange | null>>;

export const RANGE_AXES: readonly RangeAxis[] = ["megapixels", "duration", "caption_length"];

const RANGE_UNITS: Record<RangeAxis, string> = {
  megapixels: "MP",
  duration: "s",
  caption_length: "chars",
};

const ITEM_FILTER_VALUES = new Set<ItemFilter>(["all", "captioned", "issue", "uncaptioned"]);

const MEDIA_TYPE_FILTER_VALUES = new Set<MediaTypeFilter>(["all", "image", "video", "audio"]);

const FILE_FILTER_VALUES = new Set<FileFilter>(["all", "edited", "duplicates", "candidates"]);

export function isItemFilter(value: string | null): value is ItemFilter {
  return value !== null && ITEM_FILTER_VALUES.has(value as ItemFilter);
}

export function isMediaTypeFilter(value: string | null): value is MediaTypeFilter {
  return value !== null && MEDIA_TYPE_FILTER_VALUES.has(value as MediaTypeFilter);
}

export function isFileFilter(value: string | null): value is FileFilter {
  return value !== null && FILE_FILTER_VALUES.has(value as FileFilter);
}

export const DEFAULT_SORT: SortOption = DEFAULT_GALLERY_SORT;

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "name-asc", label: "Name (A–Z)" },
  { value: "name-desc", label: "Name (Z–A)" },
  { value: "date-asc", label: "Date modified (oldest)" },
  { value: "date-desc", label: "Date modified (newest)" },
  { value: "caption-asc", label: "Caption length (shortest)" },
  { value: "caption-desc", label: "Caption length (longest)" },
  { value: "megapixels-asc", label: "Megapixels (smallest)" },
  { value: "megapixels-desc", label: "Megapixels (largest)" },
  { value: "duration-asc", label: "Duration (shortest)" },
  { value: "duration-desc", label: "Duration (longest)" },
];

export function sortOptionLabel(value: SortOption): string {
  return SORT_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

const SORT_OPTION_VALUES = new Set<SortOption>(SORT_OPTIONS.map((option) => option.value));

function isSortOption(value: string): value is SortOption {
  return SORT_OPTION_VALUES.has(value as SortOption);
}

export function parseSortOption(value: string): SortOption {
  return isSortOption(value) ? value : DEFAULT_SORT;
}

function compareNames(a: GalleryItem, b: GalleryItem): number {
  return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
}

function modifiedTimestamp(item: GalleryItem): number {
  if (!item.modified_at) return 0;
  const parsed = Date.parse(item.modified_at);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function captionLength(item: GalleryItem): number {
  return item.description?.length ?? 0;
}

function totalMegapixels(item: GalleryItem): number {
  const width = item.width ?? 0;
  const height = item.height ?? 0;
  if (width <= 0 || height <= 0) return 0;
  return (width * height) / 1_000_000;
}

function videoDuration(item: GalleryItem): number {
  return durationSeconds(item.duration) ?? 0;
}

type NumericSort = Exclude<SortOption, "name-asc" | "name-desc">;

const NUMERIC_SORT: Record<NumericSort, (item: GalleryItem) => number> = {
  "date-asc": modifiedTimestamp,
  "date-desc": modifiedTimestamp,
  "caption-asc": captionLength,
  "caption-desc": captionLength,
  "megapixels-asc": totalMegapixels,
  "megapixels-desc": totalMegapixels,
  "duration-asc": videoDuration,
  "duration-desc": videoDuration,
};

export function sortGalleryItems(items: GalleryItem[], sort: SortOption): GalleryItem[] {
  if (sort === "name-asc") return [...items].sort(compareNames);
  if (sort === "name-desc") return [...items].sort((a, b) => compareNames(b, a));

  const valueOf = NUMERIC_SORT[sort];
  if (!valueOf) return [...items].sort(compareNames);

  const descending = sort.endsWith("-desc");
  return items
    .map((item) => ({ item, value: valueOf(item) }))
    .sort(
      (left, right) =>
        (descending ? right.value - left.value : left.value - right.value) ||
        compareNames(left.item, right.item),
    )
    .map((entry) => entry.item);
}

/** Why a regex search query does not compile, or null when it does (or is blank). */
export function searchRegexError(query: string): string | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  try {
    new RegExp(trimmed, SEARCH_REGEX_FLAGS);
    return null;
  } catch (error) {
    // Chrome prefixes "Invalid regular expression: /pattern/flags: "; keep only the reason.
    const reason = (error instanceof Error ? error.message : "").split(": ").pop()?.trim();
    if (!reason) return "Invalid pattern";
    return reason.charAt(0).toUpperCase() + reason.slice(1);
  }
}

type TextMatcher = (text: string) => boolean;

/**
 * How a regex search decides a text: from `regexMatches`, worked out ahead in a worker
 * (`useRegexSearch`), else by testing here. An invalid pattern matches nothing: a literal
 * fallback would contradict the regex toggle.
 */
function regexMatcher(query: string, regexMatches?: ReadonlySet<string> | null): TextMatcher {
  if (regexMatches) return (text) => regexMatches.has(text);
  const pattern = compileSearchRegex(query);
  return pattern ? (text) => pattern.test(text) : () => false;
}

function matchesSearchQuery(
  query: string,
  matcher: TextMatcher | null,
  matchNames: boolean,
  name: string,
  description?: string | null,
  tags: readonly MediaTag[] = [],
): boolean {
  if (matcher) {
    if (matchNames && matcher(name)) return true;
    if (description != null && matcher(description)) return true;
    return tags.some((tag) => matcher(tag.label));
  }

  const needle = query.toLowerCase();
  if (matchNames && name.toLowerCase().includes(needle)) return true;
  if (description?.toLowerCase().includes(needle)) return true;
  // Tags describe the content like a caption does, so they are searched with it.
  return tags.some((tag) => tag.label.includes(needle));
}

/**
 * matchNames off searches captions only: an OR over both fields would keep every item.
 * `regexMatches` holds the texts a regex search matched, so no pattern runs on this thread.
 */
export function filterBySearch(
  items: GalleryItem[],
  query: string,
  regex: boolean,
  matchNames: boolean,
  regexMatches?: ReadonlySet<string> | null,
): GalleryItem[] {
  const trimmed = query.trim();
  if (!trimmed) return items;

  const matcher = regex ? regexMatcher(trimmed, regexMatches) : null;

  return items.filter((item) =>
    matchesSearchQuery(trimmed, matcher, matchNames, item.name, item.description, item.tags),
  );
}

export function filterSubfoldersBySearch(
  folders: Subfolder[],
  query: string,
  regex: boolean,
  regexMatches?: ReadonlySet<string> | null,
): Subfolder[] {
  const trimmed = query.trim();
  if (!trimmed) return folders;

  const matcher = regex ? regexMatcher(trimmed, regexMatches) : null;

  return folders.filter((folder) => matchesSearchQuery(trimmed, matcher, true, folder.name));
}

export function applyItemFilter(items: GalleryItem[], filter: ItemFilter): GalleryItem[] {
  if (filter === "captioned") return items.filter((item) => item.has_description);
  if (filter === "issue") return items.filter(isResolvableIssueItem);
  if (filter === "uncaptioned") return items.filter(isUncaptionedItem);
  return items;
}

export function applyFileFilter(items: GalleryItem[], fileFilter: FileFilter): GalleryItem[] {
  if (fileFilter === "edited") return items.filter(isEditedItem);
  if (fileFilter === "duplicates") return items.filter(isDuplicateItem);
  if (fileFilter === "candidates") return items.filter(isCandidateItem);
  return items;
}

export function matchesMediaTypeFilter(item: GalleryItem, filter: MediaTypeFilter): boolean {
  if (filter === "image") return item.media_type === "image";
  if (filter === "video") return isMotion(item);
  if (filter === "audio") return isAudio(item);
  return true;
}

export function applyMediaTypeFilter(items: GalleryItem[], filter: MediaTypeFilter): GalleryItem[] {
  if (filter === "all") return items;
  return items.filter((item) => matchesMediaTypeFilter(item, filter));
}

/**
 * The value a range filters on, measured exactly as Statistics measures it, so a clicked bucket
 * and its range select the same files. `null` when the file has none, e.g. a still's duration.
 */
export function rangeValue(item: GalleryItem, axis: RangeAxis): number | null {
  if (axis === "caption_length") {
    return item.caption_status === "text" && item.description ? item.description.length : null;
  }
  if (axis === "duration") return isVideo(item) ? durationSeconds(item.duration) : null;
  if (isAudio(item)) return null;
  const width = item.width ?? 0;
  const height = item.height ?? 0;
  return width > 0 && height > 0 ? (width * height) / 1_000_000 : null;
}

export function isActiveRange(range: GalleryRange | null | undefined): range is GalleryRange {
  return range != null && (range.min != null || range.max != null);
}

export function hasActiveRanges(ranges: GalleryRanges): boolean {
  return RANGE_AXES.some((axis) => isActiveRange(ranges[axis]));
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** A usable range from stored JSON, or `null` for one that is malformed, empty or inverted. */
export function parseRange(value: unknown): GalleryRange | null {
  if (!value || typeof value !== "object") return null;
  const { min, max } = value as Record<string, unknown>;
  const range = { min: finiteOrNull(min), max: finiteOrNull(max) };
  if (min != null && range.min == null) return null;
  if (max != null && range.max == null) return null;
  if (!isActiveRange(range)) return null;
  if (range.min != null && range.max != null && range.min >= range.max) return null;
  return range;
}

/** Only the axes this build knows, each with a usable range. */
export function parseRanges(value: unknown): GalleryRanges {
  if (!value || typeof value !== "object") return {};
  const stored = value as Record<string, unknown>;
  const ranges: GalleryRanges = {};
  for (const axis of RANGE_AXES) {
    const range = parseRange(stored[axis]);
    if (range) ranges[axis] = range;
  }
  return ranges;
}

/** `min <= value < max`, the half-open interval Statistics buckets use. */
function inRange(value: number, range: GalleryRange): boolean {
  return (range.min == null || value >= range.min) && (range.max == null || value < range.max);
}

export function applyRanges(items: GalleryItem[], ranges: GalleryRanges): GalleryItem[] {
  const active = RANGE_AXES.flatMap((axis) => {
    const range = ranges[axis];
    return isActiveRange(range) ? [{ axis, range }] : [];
  });
  if (active.length === 0) return items;

  return items.filter((item) =>
    active.every(({ axis, range }) => {
      const value = rangeValue(item, axis);
      return value != null && inRange(value, range);
    }),
  );
}

function formatBound(value: number): string {
  return String(Number(value.toFixed(2)));
}

/** "1 – 2 MP", "≥ 4 s", "< 256 chars": the Statistics label style, with the unit. */
export function formatRange(axis: RangeAxis, range: GalleryRange): string {
  const unit = RANGE_UNITS[axis];
  if (range.min != null && range.max != null) {
    return `${formatBound(range.min)} – ${formatBound(range.max)} ${unit}`;
  }
  if (range.min != null) return `≥ ${formatBound(range.min)} ${unit}`;
  return `< ${formatBound(range.max ?? 0)} ${unit}`;
}

export function processGalleryItems(
  items: GalleryItem[],
  options: {
    filter: ItemFilter;
    mediaTypeFilter: MediaTypeFilter;
    fileFilter: FileFilter;
    ranges?: GalleryRanges;
    searchQuery: string;
    searchRegex: boolean;
    searchNames: boolean;
    regexMatches?: ReadonlySet<string> | null;
    sort: SortOption;
  },
): GalleryItem[] {
  return sortGalleryItems(
    filterBySearch(
      applyRanges(
        applyFileFilter(
          applyItemFilter(applyMediaTypeFilter(items, options.mediaTypeFilter), options.filter),
          options.fileFilter,
        ),
        options.ranges ?? {},
      ),
      options.searchQuery,
      options.searchRegex,
      options.searchNames,
      options.regexMatches,
    ),
    options.sort,
  );
}

function countBy<T>(items: T[], predicate: (item: T) => boolean): number {
  let count = 0;
  for (const item of items) {
    if (predicate(item)) count += 1;
  }
  return count;
}

/** The backup an edit leaves behind is what marks a file as changed. */
export function isEditedItem(item: GalleryItem): boolean {
  return item.has_backup;
}

export function countEdited(items: GalleryItem[]): number {
  return countBy(items, isEditedItem);
}

export function countCaptioned(items: GalleryItem[]): number {
  return countBy(items, (item) => item.has_description);
}

export function countIssues(items: GalleryItem[]): number {
  return countBy(items, isResolvableIssueItem);
}

export function countMediaType(items: GalleryItem[], filter: MediaTypeFilter): number {
  return countBy(items, (item) => matchesMediaTypeFilter(item, filter));
}
