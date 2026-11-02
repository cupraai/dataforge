import { useId, useState } from "react";
import { FilterRangesDialog } from "@/features/gallery/components/FilterRangesDialog";
import {
  FILE_FILTER_OPTIONS,
  FILTER_AXIS_LABELS,
  FILTER_OPTIONS,
  MEDIA_TYPE_FILTER_OPTIONS,
} from "@/features/gallery/lib/filters";
import {
  RANGE_AXES,
  formatRange,
  isActiveRange,
  type FileFilter,
  type GalleryRanges,
  type ItemFilter,
  type MediaTypeFilter,
  type RangeAxis,
} from "@/features/gallery/lib/query";
import { usePopupMenu } from "@/shared/hooks/usePopupMenu";
import { iconFilter, iconRulerDimensionLine, type AppIcon } from "@/shared/icons";
import { classNames } from "@/shared/lib/classNames";
import { AnchoredLayer } from "@/shared/ui/AnchoredLayer";
import { Icon } from "@/shared/ui/Icon";
import { Tooltip } from "@/shared/ui/Tooltip";
import type { GalleryItem } from "@/shared/types";

const RANGE_MENU_LABELS: Record<RangeAxis, string> = {
  megapixels: "Megapixels",
  duration: "Video duration",
  caption_length: "Caption length",
};

/** The range filters, threaded through the toolbar as one prop. */
export interface RangeControls {
  ranges: GalleryRanges;
  onRangesChange: (ranges: GalleryRanges) => void;
  /** What every filter but the ranges keeps, which the range dialog charts and counts. */
  rangeBaseItems: () => GalleryItem[];
}

interface ToolbarFilterMenuProps extends RangeControls {
  searchQuery: string;
  filter: ItemFilter;
  filterCounts: Record<ItemFilter, number>;
  mediaTypeFilter: MediaTypeFilter;
  mediaTypeFilterCounts: Record<MediaTypeFilter, number>;
  fileFilter: FileFilter;
  fileFilterCounts: Record<FileFilter, number>;
  onFilterChange: (value: ItemFilter) => void;
  onMediaTypeFilterChange: (value: MediaTypeFilter) => void;
  onFileFilterChange: (value: FileFilter) => void;
}

interface FilterMenuGroupProps<T extends string> {
  label: string;
  options: ReadonlyArray<{ value: T; label: string; ariaLabel: string; icon: AppIcon }>;
  counts: Record<T, number>;
  value: T;
  searchQuery: string;
  onChange: (value: T) => void;
}

function filterCountLabel(ariaLabel: string, count: number, searchQuery: string): string {
  const trimmedSearch = searchQuery.trim();
  if (!trimmedSearch) {
    return `${ariaLabel} (${count})`;
  }

  return `${ariaLabel} (${count} matching "${trimmedSearch}")`;
}

function optionLabelFor(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string,
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function FilterMenuGroup<T extends string>({
  label,
  options,
  counts,
  value,
  searchQuery,
  onChange,
}: FilterMenuGroupProps<T>) {
  const labelId = useId();

  return (
    <div className="toolbar__filter-menu-group" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="toolbar__filter-menu-group-label">
        {label}
      </span>
      {options.map((option) => {
        const active = option.value === value;
        const count = counts[option.value];

        return (
          <button
            key={option.value}
            type="button"
            role="menuitemradio"
            aria-checked={active}
            aria-label={filterCountLabel(option.ariaLabel, count, searchQuery)}
            className={classNames(
              "toolbar__filter-menu-option",
              active && "toolbar__filter-menu-option--active",
            )}
            onClick={() => onChange(option.value)}
          >
            <Icon icon={option.icon} className="toolbar__filter-menu-option-icon" />
            <span className="toolbar__filter-menu-option-label">{option.label}</span>
            <span className="toolbar__filter-menu-option-count" aria-hidden="true">
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function ToolbarFilterMenu({
  searchQuery,
  filter,
  filterCounts,
  mediaTypeFilter,
  mediaTypeFilterCounts,
  fileFilter,
  fileFilterCounts,
  onFilterChange,
  onMediaTypeFilterChange,
  onFileFilterChange,
  ranges,
  onRangesChange,
  rangeBaseItems,
}: ToolbarFilterMenuProps) {
  const { open, close, menuId, rootRef, panelRef, triggerProps } = usePopupMenu();
  const [rangesAxis, setRangesAxis] = useState<RangeAxis | null>(null);
  const rangesLabelId = useId();
  const activeLabels: string[] = [];
  if (mediaTypeFilter !== "all") {
    activeLabels.push(optionLabelFor(MEDIA_TYPE_FILTER_OPTIONS, mediaTypeFilter));
  }
  if (filter !== "all") {
    activeLabels.push(optionLabelFor(FILTER_OPTIONS, filter));
  }
  // Last, matching the panel order, so the summary reads in the order the sections appear.
  if (fileFilter !== "all") {
    activeLabels.push(optionLabelFor(FILE_FILTER_OPTIONS, fileFilter));
  }
  for (const axis of RANGE_AXES) {
    const range = ranges[axis];
    if (isActiveRange(range)) activeLabels.push(formatRange(axis, range));
  }

  const filtering = activeLabels.length > 0;
  const tooltip = filtering
    ? `Filtering by ${activeLabels.join(" & ")}`
    : "Filter by media type, caption status, files and ranges";

  return (
    <div
      ref={rootRef}
      className={classNames("toolbar__filter-menu", open && "toolbar__filter-menu--open")}
    >
      <Tooltip content={tooltip}>
        <button
          type="button"
          className={classNames(
            "toolbar__filter-menu-trigger",
            filtering && "toolbar__filter-menu-trigger--filtering",
          )}
          aria-label="Filter media"
          {...triggerProps}
        >
          <Icon icon={iconFilter} className="toolbar__filter-menu-trigger-icon" />
        </button>
      </Tooltip>

      <AnchoredLayer
        anchorRef={rootRef}
        floatingRef={panelRef}
        open={open}
        id={menuId}
        className="toolbar__filter-menu-panel"
        role="menu"
        label="Filters"
      >
        <FilterMenuGroup
          label={FILTER_AXIS_LABELS.mediaType}
          options={MEDIA_TYPE_FILTER_OPTIONS}
          counts={mediaTypeFilterCounts}
          value={mediaTypeFilter}
          searchQuery={searchQuery}
          onChange={onMediaTypeFilterChange}
        />
        <FilterMenuGroup
          label={FILTER_AXIS_LABELS.caption}
          options={FILTER_OPTIONS}
          counts={filterCounts}
          value={filter}
          searchQuery={searchQuery}
          onChange={onFilterChange}
        />
        <FilterMenuGroup
          label={FILTER_AXIS_LABELS.file}
          options={FILE_FILTER_OPTIONS}
          counts={fileFilterCounts}
          value={fileFilter}
          searchQuery={searchQuery}
          onChange={onFileFilterChange}
        />
        <div className="toolbar__filter-menu-group" role="group" aria-labelledby={rangesLabelId}>
          <span id={rangesLabelId} className="toolbar__filter-menu-group-label">
            Ranges
          </span>
          {RANGE_AXES.map((axis) => {
            const range = ranges[axis];
            const active = isActiveRange(range);
            return (
              <button
                key={axis}
                type="button"
                role="menuitem"
                className={classNames(
                  "toolbar__filter-menu-option",
                  active && "toolbar__filter-menu-option--active",
                )}
                onClick={() => {
                  close();
                  setRangesAxis(axis);
                }}
              >
                <Icon icon={iconRulerDimensionLine} className="toolbar__filter-menu-option-icon" />
                <span className="toolbar__filter-menu-option-label">{RANGE_MENU_LABELS[axis]}</span>
                <span className="toolbar__filter-menu-option-count">
                  {active ? formatRange(axis, range) : "Any"}
                </span>
              </button>
            );
          })}
        </div>
      </AnchoredLayer>

      {rangesAxis && (
        <FilterRangesDialog
          ranges={ranges}
          focusAxis={rangesAxis}
          rangeBaseItems={rangeBaseItems}
          onApply={onRangesChange}
          onClose={() => setRangesAxis(null)}
        />
      )}
    </div>
  );
}
