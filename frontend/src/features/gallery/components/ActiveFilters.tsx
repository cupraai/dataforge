import { Button } from "@/shared/ui/Button";
import {
  RANGE_AXES,
  formatRange,
  isActiveRange,
  type FileFilter,
  type ItemFilter,
  type MediaTypeFilter,
  type GalleryRange,
  type GalleryRanges,
  type RangeAxis,
} from "@/features/gallery/lib/query";
import {
  FILTER_OPTIONS,
  FILE_FILTER_OPTIONS,
  MEDIA_TYPE_FILTER_OPTIONS,
} from "@/features/gallery/lib/filters";
import { iconX } from "@/shared/icons";

const RANGE_CHIP_NAMES: Record<RangeAxis, string> = {
  megapixels: "megapixels",
  duration: "duration",
  caption_length: "caption length",
};

interface ActiveFiltersProps {
  filter: ItemFilter;
  mediaTypeFilter: MediaTypeFilter;
  fileFilter: FileFilter;
  ranges: GalleryRanges;
  onFilterChange: (value: ItemFilter) => void;
  onMediaTypeFilterChange: (value: MediaTypeFilter) => void;
  onFileFilterChange: (value: FileFilter) => void;
  onRangeChange: (axis: RangeAxis, range: GalleryRange | null) => void;
  /** Every axis and range; the search has its own clear button. */
  onClearFilters: () => void;
}

/** A chip per active filter to remove it; the Media count already says how many files match. */
export function ActiveFilters({
  filter,
  mediaTypeFilter,
  fileFilter,
  ranges,
  onFilterChange,
  onMediaTypeFilterChange,
  onFileFilterChange,
  onRangeChange,
  onClearFilters,
}: ActiveFiltersProps) {
  const activeRanges = RANGE_AXES.flatMap((axis) => {
    const range = ranges[axis];
    return isActiveRange(range) ? [{ axis, range }] : [];
  });
  const anyFilter =
    filter !== "all" ||
    mediaTypeFilter !== "all" ||
    fileFilter !== "all" ||
    activeRanges.length > 0;
  if (!anyFilter) return null;

  return (
    <div className="active-filters">
      {filter !== "all" && (
        <Button
          iconEnd={iconX}
          onClick={() => onFilterChange("all")}
          aria-label="Remove caption filter"
          variant="primary"
          size="xs"
        >
          {FILTER_OPTIONS.find((option) => option.value === filter)?.label}
        </Button>
      )}
      {mediaTypeFilter !== "all" && (
        <Button
          iconEnd={iconX}
          onClick={() => onMediaTypeFilterChange("all")}
          aria-label="Remove media type filter"
          variant="primary"
          size="xs"
        >
          {MEDIA_TYPE_FILTER_OPTIONS.find((option) => option.value === mediaTypeFilter)?.label}
        </Button>
      )}
      {fileFilter !== "all" && (
        <Button
          iconEnd={iconX}
          onClick={() => onFileFilterChange("all")}
          aria-label="Remove file filter"
          variant="primary"
          size="xs"
        >
          {FILE_FILTER_OPTIONS.find((option) => option.value === fileFilter)?.label}
        </Button>
      )}
      {activeRanges.map(({ axis, range }) => (
        <Button
          iconEnd={iconX}
          key={axis}
          onClick={() => onRangeChange(axis, null)}
          aria-label={`Remove ${RANGE_CHIP_NAMES[axis]} range`}
          variant="primary"
          size="xs"
        >
          {formatRange(axis, range)}
        </Button>
      ))}
      <Button onClick={onClearFilters} size="xs">
        Clear filters
      </Button>
    </div>
  );
}
