import { memo, type MouseEvent } from "react";
import { rowMarkers, rowMetaCells, rowStatus } from "@/features/gallery/lib/listRowCells";
import { isAudio, isVideo } from "@/features/gallery/lib/itemKind";
import { selectionIntentFor } from "@/features/gallery/lib/selectionIntent";
import { iconAudioLines, iconCheck, iconImage, iconVideo } from "@/shared/icons";
import type { GalleryItem } from "@/shared/types";
import { classNames } from "@/shared/lib/classNames";
import { Icon } from "@/shared/ui/Icon";
import { MiddleTruncate } from "@/shared/ui/MiddleTruncate";
import { GalleryCardMedia } from "./GalleryCardMedia";
import { Tooltip } from "@/shared/ui/Tooltip";

interface GalleryListRowProps {
  inspected?: boolean;
  item: GalleryItem;
  onSelect: (path: string) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (path: string) => void;
  onExtendSelect?: (path: string) => void;
  /** Shows the caption after the file name. */
  captionPreview?: boolean;
}

export const GalleryListRow = memo(function GalleryListRow({
  inspected = false,
  item,
  onSelect,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  onExtendSelect,
  captionPreview = false,
}: GalleryListRowProps) {
  const status = rowStatus(item);
  const markers = rowMarkers(item);
  const metaCells = rowMetaCells(item);

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    const intent = selectionIntentFor(event, selectionMode);

    if (intent === "range" && onExtendSelect) {
      onExtendSelect(item.path);
      return;
    }
    if (intent !== "open" && onToggleSelect) {
      onToggleSelect(item.path);
      return;
    }
    onSelect(item.path);
  };

  return (
    <button
      data-inspected={inspected || undefined}
      type="button"
      className={classNames(
        "gallery-list-row",
        // Adds the leading checkbox column to the row's grid.
        selectionMode && "gallery-list-row--selecting",
        selected && "gallery-list-row--selected",
      )}
      onClick={handleClick}
      onDragStart={(event) => event.preventDefault()}
      aria-label={
        selectionMode ? `${selected ? "Deselect" : "Select"} ${item.name}` : `View ${item.name}`
      }
      aria-pressed={selectionMode ? selected : undefined}
    >
      {selectionMode && (
        <span className="gallery-list-row__check" aria-hidden="true">
          {selected && <Icon icon={iconCheck} className="gallery-list-row__check-icon" />}
        </span>
      )}
      <span className="gallery-list-row__thumb">
        <GalleryCardMedia item={item} />
      </span>
      <span className="gallery-list-row__name">
        <Icon
          icon={isVideo(item) ? iconVideo : isAudio(item) ? iconAudioLines : iconImage}
          className="gallery-list-row__name-icon"
        />
        <MiddleTruncate text={item.name} className="gallery-list-row__name-text" />
        {captionPreview && item.description && (
          <span className="gallery-list-row__caption">{item.description}</span>
        )}
      </span>
      <span className="gallery-list-row__markers">
        {markers.map((marker) => (
          <Tooltip key={marker.key} content={marker.label}>
            <span
              className={`gallery-list-row__marker gallery-list-row__marker--${marker.variant}`}
            >
              <Icon icon={marker.icon} className="gallery-list-row__marker-icon" />
            </span>
          </Tooltip>
        ))}
      </span>
      <Tooltip content={status.label}>
        <span className={`gallery-list-row__status gallery-list-row__status--${status.variant}`}>
          <Icon icon={status.icon} className="gallery-list-row__status-icon" />
        </span>
      </Tooltip>
      {metaCells.map((cell) => (
        <span
          key={cell.key}
          className={`gallery-list-row__meta-item gallery-list-row__meta-item--${cell.key}`}
        >
          {cell.value}
        </span>
      ))}
    </button>
  );
});
