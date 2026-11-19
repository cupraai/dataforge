import {
  ROW_META_COLUMN_LABELS,
  ROW_STATUS_LABEL,
  type RowMetaColumn,
} from "@/features/gallery/lib/listRowCells";
import { classNames } from "@/shared/lib/classNames";

interface GalleryListHeaderProps {
  selectionMode: boolean;
}

/** Column headings sized by the ancestor's widths; hidden from assistive tech like the cells. */
export function GalleryListHeader({ selectionMode }: GalleryListHeaderProps) {
  return (
    <div
      className={classNames(
        "gallery-list-header",
        selectionMode && "gallery-list-header--selecting",
      )}
      aria-hidden="true"
    >
      {selectionMode && <span />}
      <span />
      <span className="gallery-list-header__cell">Name</span>
      <span />
      <span className="gallery-list-header__cell gallery-list-header__cell--status">
        {ROW_STATUS_LABEL}
      </span>
      {(Object.keys(ROW_META_COLUMN_LABELS) as RowMetaColumn[]).map((column) => (
        <span key={column} className="gallery-list-header__cell gallery-list-header__cell--meta">
          {ROW_META_COLUMN_LABELS[column]}
        </span>
      ))}
    </div>
  );
}
