import type { SortOption } from "@/features/gallery/lib/query";
import {
  iconArrowDownWideNarrow,
  iconArrowDownZA,
  iconArrowUpAZ,
  iconArrowUpNarrowWide,
  iconCalendar,
  iconCaseSensitive,
  iconHourglass,
  iconMessageSquareText,
  iconProportions,
  iconWeight,
  type AppIcon,
} from "@/shared/icons";

export interface SortOrderChoice {
  value: SortOption;
  label: string;
}

export interface SortField {
  label: string;
  icon: AppIcon;
  /** Both directions; picking the field starts at the first. */
  orders: [SortOrderChoice, SortOrderChoice];
}

export const SORT_FIELDS: SortField[] = [
  {
    label: "Date created",
    icon: iconCalendar,
    orders: [
      { value: "created-desc", label: "Newest first" },
      { value: "created-asc", label: "Oldest first" },
    ],
  },
  {
    label: "Date modified",
    icon: iconCalendar,
    orders: [
      { value: "date-desc", label: "Newest first" },
      { value: "date-asc", label: "Oldest first" },
    ],
  },
  {
    label: "Name",
    icon: iconCaseSensitive,
    orders: [
      { value: "name-asc", label: "A to Z" },
      { value: "name-desc", label: "Z to A" },
    ],
  },
  {
    label: "File size",
    icon: iconWeight,
    orders: [
      { value: "size-desc", label: "Largest first" },
      { value: "size-asc", label: "Smallest first" },
    ],
  },
  {
    label: "Caption length",
    icon: iconMessageSquareText,
    orders: [
      { value: "caption-asc", label: "Shortest first" },
      { value: "caption-desc", label: "Longest first" },
    ],
  },
  {
    label: "Megapixels",
    icon: iconProportions,
    orders: [
      { value: "megapixels-desc", label: "Largest first" },
      { value: "megapixels-asc", label: "Smallest first" },
    ],
  },
  {
    label: "Duration",
    icon: iconHourglass,
    orders: [
      { value: "duration-asc", label: "Shortest first" },
      { value: "duration-desc", label: "Longest first" },
    ],
  },
];

export function sortFieldOf(value: SortOption): SortField {
  return (
    SORT_FIELDS.find((field) => field.orders.some((order) => order.value === value)) ??
    SORT_FIELDS[0]
  );
}

/** Letters for names; for measured fields, a stack that narrows or widens downwards. */
export function sortDirectionIcon(value: SortOption): AppIcon {
  if (value === "name-asc") return iconArrowUpAZ;
  if (value === "name-desc") return iconArrowDownZA;
  return value.endsWith("-asc") ? iconArrowUpNarrowWide : iconArrowDownWideNarrow;
}
