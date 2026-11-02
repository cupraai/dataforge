import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { countDuplicates } from "@/features/gallery/lib/duplicates";
import { getFilterEmptyState } from "@/features/gallery/lib/filters";
import { countCandidates } from "@/features/gallery/lib/candidateReview";
import {
  cacheGallerySessionQuery,
  readGallerySessionQuery,
} from "@/features/gallery/lib/sessionPreferences";
import {
  DEFAULT_SORT,
  applyFileFilter,
  applyItemFilter,
  applyMediaTypeFilter,
  applyRanges,
  countCaptioned,
  countEdited,
  countIssues,
  countMediaType,
  filterBySearch,
  hasActiveRanges,
  parseSortOption,
  processGalleryItems,
  searchRegexError,
  type FileFilter,
  type GalleryRange,
  type GalleryRanges,
  type ItemFilter,
  type MediaTypeFilter,
  type RangeAxis,
  type SortOption,
} from "@/features/gallery/lib/query";
import { regexSearchTexts } from "@/features/gallery/lib/regexSearch";
import { useRegexSearch } from "@/features/gallery/hooks/useRegexSearch";
import type { GalleryItem } from "@/shared/types";
import { useUiSettings, useUpdateUiSettings } from "@/shared/preferences/uiPreferences";

export function useGalleryQuery(items: GalleryItem[]) {
  const [filter, setFilterState] = useState<ItemFilter>(() => readGallerySessionQuery().filter);
  const [mediaTypeFilter, setMediaTypeFilterState] = useState<MediaTypeFilter>(
    () => readGallerySessionQuery().mediaTypeFilter,
  );
  const [fileFilter, setFileFilterState] = useState<FileFilter>(
    () => readGallerySessionQuery().fileFilter,
  );
  const [ranges, setRangesState] = useState<GalleryRanges>(() => readGallerySessionQuery().ranges);
  const [searchQuery, setSearchQueryState] = useState(() => readGallerySessionQuery().searchQuery);
  const [searchRegex, setSearchRegexState] = useState(() => readGallerySessionQuery().searchRegex);
  const [searchNames, setSearchNamesState] = useState(() => readGallerySessionQuery().searchNames);
  const sort = parseSortOption(useUiSettings().sort || DEFAULT_SORT);
  const updateUiSettings = useUpdateUiSettings();

  // Typing stays responsive in a large folder: the grid catches up with the query.
  const filterQuery = useDeferredValue(searchQuery);

  const setFilter = useCallback((value: ItemFilter) => {
    setFilterState(value);
    cacheGallerySessionQuery({ filter: value });
  }, []);

  const setMediaTypeFilter = useCallback((value: MediaTypeFilter) => {
    setMediaTypeFilterState(value);
    cacheGallerySessionQuery({ mediaTypeFilter: value });
  }, []);

  const setFileFilter = useCallback((value: FileFilter) => {
    setFileFilterState(value);
    cacheGallerySessionQuery({ fileFilter: value });
  }, []);

  /** `null` removes the axis's range. */
  const setRange = useCallback((axis: RangeAxis, range: GalleryRange | null) => {
    setRangesState((current) => {
      const next = { ...current };
      if (range) next[axis] = range;
      else delete next[axis];
      cacheGallerySessionQuery({ ranges: next });
      return next;
    });
  }, []);

  const setRanges = useCallback((value: GalleryRanges) => {
    setRangesState(value);
    cacheGallerySessionQuery({ ranges: value });
  }, []);

  // Search is deliberately untouched: it has its own clear button and its own intent.
  const resetFilters = useCallback(() => {
    setFilterState("all");
    setMediaTypeFilterState("all");
    setFileFilterState("all");
    setRangesState({});
    cacheGallerySessionQuery({
      filter: "all",
      mediaTypeFilter: "all",
      fileFilter: "all",
      ranges: {},
    });
  }, []);

  const setSearchQuery = useCallback((value: string) => {
    setSearchQueryState(value);
    cacheGallerySessionQuery({ searchQuery: value });
  }, []);

  const setSearchRegex = useCallback((value: boolean) => {
    setSearchRegexState(value);
    cacheGallerySessionQuery({ searchRegex: value });
  }, []);

  const setSearchNames = useCallback((value: boolean) => {
    setSearchNamesState(value);
    cacheGallerySessionQuery({ searchNames: value });
  }, []);

  const setSort = useCallback(
    (value: SortOption) => updateUiSettings({ sort: value }),
    [updateUiSettings],
  );

  // Regex matching runs in a worker under a time budget; every filter below reads its answer.
  const searchTexts = useMemo(() => regexSearchTexts(items), [items]);
  const trimmedFilterQuery = filterQuery.trim();
  const regexPattern =
    searchRegex && trimmedFilterQuery && !searchRegexError(trimmedFilterQuery)
      ? trimmedFilterQuery
      : null;
  const regexSearch = useRegexSearch(regexPattern, searchTexts);
  const regexMatches = regexSearch.status === "idle" ? null : regexSearch.matches;
  // Highlights test the pattern on this thread, so only one the worker finished in time is used.
  const highlightQuery = !searchRegex
    ? searchQuery
    : regexSearch.status === "ready"
      ? filterQuery
      : "";

  // Ranges narrow every axis below, menu counts included, so they are applied first.
  const rangedItems = useMemo(() => applyRanges(items, ranges), [items, ranges]);

  const mediaTypeFilteredItems = useMemo(
    () => applyMediaTypeFilter(rangedItems, mediaTypeFilter),
    [rangedItems, mediaTypeFilter],
  );

  const captionScopedItems = useMemo(
    () => applyItemFilter(rangedItems, filter),
    [rangedItems, filter],
  );

  const captionFilteredItems = useMemo(
    () => applyItemFilter(mediaTypeFilteredItems, filter),
    [mediaTypeFilteredItems, filter],
  );

  const filterMatchedItems = useMemo(
    () => applyFileFilter(captionFilteredItems, fileFilter),
    [captionFilteredItems, fileFilter],
  );

  const filteredItems = useMemo(
    () =>
      processGalleryItems(rangedItems, {
        filter,
        mediaTypeFilter,
        fileFilter,
        searchQuery: filterQuery,
        searchRegex,
        searchNames,
        regexMatches,
        sort,
      }),
    [
      rangedItems,
      filter,
      mediaTypeFilter,
      fileFilter,
      filterQuery,
      searchRegex,
      searchNames,
      regexMatches,
      sort,
    ],
  );

  const hasActiveSearch = searchQuery.trim().length > 0;
  const rangesActive = hasActiveRanges(ranges);
  const hasActiveFilters =
    filter !== "all" || mediaTypeFilter !== "all" || fileFilter !== "all" || rangesActive;

  /** What every filter but the ranges keeps; read on demand, as only the range dialog needs it. */
  const rangeBaseItems = useCallback(
    () =>
      filterBySearch(
        applyFileFilter(
          applyItemFilter(applyMediaTypeFilter(items, mediaTypeFilter), filter),
          fileFilter,
        ),
        filterQuery,
        searchRegex,
        searchNames,
        regexMatches,
      ),
    [
      items,
      mediaTypeFilter,
      filter,
      fileFilter,
      filterQuery,
      searchRegex,
      searchNames,
      regexMatches,
    ],
  );

  const captionedCount = useMemo(() => countCaptioned(items), [items]);

  // Each axis counts with the others applied, so a menu count is what picking it leaves.
  const captionFilterCountItems = useMemo(
    () =>
      filterBySearch(
        applyFileFilter(mediaTypeFilteredItems, fileFilter),
        filterQuery,
        searchRegex,
        searchNames,
        regexMatches,
      ),
    [mediaTypeFilteredItems, fileFilter, filterQuery, searchRegex, searchNames, regexMatches],
  );

  const mediaTypeFilterCountItems = useMemo(
    () =>
      filterBySearch(
        applyFileFilter(captionScopedItems, fileFilter),
        filterQuery,
        searchRegex,
        searchNames,
        regexMatches,
      ),
    [captionScopedItems, fileFilter, filterQuery, searchRegex, searchNames, regexMatches],
  );

  // Files-option counts: this axis off, the others on, so each number is what it leaves.
  const fileFilterCountItems = useMemo(
    () => filterBySearch(captionFilteredItems, filterQuery, searchRegex, searchNames, regexMatches),
    [captionFilteredItems, filterQuery, searchRegex, searchNames, regexMatches],
  );

  const filterCounts = useMemo(() => {
    const captioned = countCaptioned(captionFilterCountItems);
    const issue = countIssues(captionFilterCountItems);
    return {
      all: captionFilterCountItems.length,
      captioned,
      issue,
      uncaptioned: captionFilterCountItems.length - captioned,
    } as const;
  }, [captionFilterCountItems]);

  const fileFilterCounts = useMemo(
    () =>
      ({
        all: fileFilterCountItems.length,
        edited: countEdited(fileFilterCountItems),
        duplicates: countDuplicates(fileFilterCountItems),
        candidates: countCandidates(fileFilterCountItems),
      }) as const,
    [fileFilterCountItems],
  );

  const mediaTypeFilterCounts = useMemo(() => {
    const images = countMediaType(mediaTypeFilterCountItems, "image");
    const videos = countMediaType(mediaTypeFilterCountItems, "video");
    const audio = countMediaType(mediaTypeFilterCountItems, "audio");
    return {
      all: mediaTypeFilterCountItems.length,
      image: images,
      video: videos,
      audio,
    } as const;
  }, [mediaTypeFilterCountItems]);

  const filterEmptyState = useMemo(
    () =>
      getFilterEmptyState({
        filter,
        mediaTypeFilter,
        fileFilter,
        searchQuery: filterQuery,
        searchError: searchRegex ? searchRegexError(filterQuery) : null,
        searchTooSlow: regexSearch.status === "too-expensive",
        hasFilterMatches: filterMatchedItems.length > 0,
        hasRanges: rangesActive,
        imageCount: countMediaType(items, "image"),
        videoCount: countMediaType(items, "video"),
        audioCount: countMediaType(items, "audio"),
      }),
    [
      filterMatchedItems.length,
      filter,
      items,
      mediaTypeFilter,
      fileFilter,
      filterQuery,
      searchRegex,
      regexSearch.status,
      rangesActive,
    ],
  );

  return {
    filter,
    setFilter,
    mediaTypeFilter,
    setMediaTypeFilter,
    fileFilter,
    setFileFilter,
    ranges,
    setRange,
    setRanges,
    rangeBaseItems,
    resetFilters,
    searchQuery,
    searchRegex,
    searchNames,
    highlightQuery,
    setSearchQuery,
    setSearchRegex,
    setSearchNames,
    sort,
    setSort,
    filteredItems,
    hasActiveSearch,
    hasActiveFilters,
    captionedCount,
    filterCounts,
    mediaTypeFilterCounts,
    fileFilterCounts,
    filterEmptyState,
  };
}
