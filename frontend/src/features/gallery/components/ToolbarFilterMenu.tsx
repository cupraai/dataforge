import { Button } from "@/shared/ui/Button";
import { useState } from "react";
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
import { Menu, MenuGroup, MenuItem } from "@/shared/ui/Menu";
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
  return (
    <MenuGroup label={label}>
      {options.map((option) => {
        const count = counts[option.value];
        return (
          <MenuItem
            key={option.value}
            kind="radio"
            icon={option.icon}
            label={option.label}
            count={count}
            checked={option.value === value}
            aria-label={filterCountLabel(option.ariaLabel, count, searchQuery)}
            onSelect={() => onChange(option.value)}
          />
        );
      })}
    </MenuGroup>
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
  const menu = usePopupMenu();
  const { close, rootRef, triggerProps } = menu;
  const [rangesAxis, setRangesAxis] = useState<RangeAxis | null>(null);
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
    <div ref={rootRef} className="toolbar__filter-menu">
      <Tooltip content={tooltip}>
        <Button
          iconOnly
          icon={iconFilter}
          className={classNames(
            "toolbar__filter-menu-trigger",
            filtering && "toolbar__filter-menu-trigger--filtering",
          )}
          aria-label="Filter media"
          {...triggerProps}
        />
      </Tooltip>

      <Menu menu={menu} label="Filters">
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
        <MenuGroup label="Ranges">
          {RANGE_AXES.map((axis) => {
            const range = ranges[axis];
            const active = isActiveRange(range);
            return (
              <MenuItem
                key={axis}
                icon={iconRulerDimensionLine}
                label={RANGE_MENU_LABELS[axis]}
                count={active ? formatRange(axis, range) : "Any"}
                active={active}
                onSelect={() => {
                  close();
                  setRangesAxis(axis);
                }}
              />
            );
          })}
        </MenuGroup>
      </Menu>

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
