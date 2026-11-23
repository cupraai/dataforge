import { useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { folderLeafName, parentFolderPath } from "@/features/folder/lib/folderPath";
import { optionalThumbnailUrl } from "@/features/gallery/api/media";
import { groupIntoRows, rowCacheKey } from "@/features/gallery/lib/groupIntoRows";
import { galleryThumbnailPreviewUrl } from "@/features/gallery/lib/thumbnail";
import { useSearchPopup } from "@/shared/hooks/useSearchPopup";
import { iconCheck, iconChevronDown, iconImage, iconX } from "@/shared/icons";
import { classNames } from "@/shared/lib/classNames";
import { formatDurationSeconds } from "@/shared/lib/format";
import { DURATION_INSTANT_MS } from "@/shared/lib/motion";
import type { ComfySourceKind, GalleryItem } from "@/shared/types";
import { AnchoredLayer } from "@/shared/ui/AnchoredLayer";
import { Icon } from "@/shared/ui/Icon";
import { IconButton } from "@/shared/ui/IconButton";
import { MiddleTruncate } from "@/shared/ui/MiddleTruncate";
import { SearchInput } from "@/shared/ui/SearchInput";

/** The picker's styles lay out as many. */
const START_FILE_COLUMNS = 4;

/** Close to a row's height, until it is measured. */
const ROW_ESTIMATE = 176;
const ROW_GAP = 8;

function matchesKind(item: GalleryItem, kind: ComfySourceKind): boolean {
  if (kind === "image") return item.media_type === "image";
  return item.media_type === "video" || item.media_type === "gif";
}

function dimensions(item: GalleryItem): string | null {
  return item.width && item.height ? `${item.width} × ${item.height}` : null;
}

/** Newest first: a start file is usually one just made for the showcase. */
function newestFirst(a: GalleryItem, b: GalleryItem): number {
  return (b.modified_at ?? "").localeCompare(a.modified_at ?? "") || a.name.localeCompare(b.name);
}

interface TileGridProps {
  items: readonly GalleryItem[];
  value: string | null;
  active: number;
  listId: string;
  optionId: (index: number) => string;
  label: string;
  emptyText: string;
  onActivate: (index: number) => void;
  onPick: (item: GalleryItem) => void;
}

/** Only the rows in view: a folder can hold thousands of files. */
function TileGrid({
  items,
  value,
  active,
  listId,
  optionId,
  label,
  emptyText,
  onActivate,
  onPick,
}: TileGridProps) {
  // Owned here: a parent's ref attaches after the virtualizer first looks for it, and the
  // list would open empty.
  const scrollRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => groupIntoRows([...items], START_FILE_COLUMNS), [items]);
  // Flags TanStack Virtual for the React Compiler, which this app does not use.
  // oxlint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE,
    gap: ROW_GAP,
    overscan: 2,
    getItemKey: (index) => rowCacheKey(rows[index] ?? []),
  });

  // Keeps the keyboard's tile in view, and opens on the chosen one.
  const { scrollToIndex } = virtualizer;
  const activeRow = Math.floor(active / START_FILE_COLUMNS);
  useEffect(() => {
    if (rows.length > 0) scrollToIndex?.(activeRow, { align: "auto" });
  }, [activeRow, rows.length, scrollToIndex]);

  return (
    <div ref={scrollRef} className="start-file-picker__scroll">
      {items.length === 0 ? (
        <p className="start-file-picker__empty">{emptyText}</p>
      ) : (
        <div
          id={listId}
          role="listbox"
          aria-label={label}
          className="start-file-picker__list"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          {virtualizer.getVirtualItems().map((row) => (
            <div
              key={row.key}
              ref={virtualizer.measureElement}
              data-index={row.index}
              role="presentation"
              className="start-file-picker__row"
              style={{ transform: `translateY(${row.start}px)` }}
            >
              {(rows[row.index] ?? []).map((item, column) => {
                const index = row.index * START_FILE_COLUMNS + column;
                const chosen = item.path === value;
                const size = dimensions(item);
                return (
                  /* oxlint-disable-next-line
                     jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
                     -- activedescendant option; the search field keeps focus */
                  <div
                    key={item.path}
                    id={optionId(index)}
                    role="option"
                    aria-selected={chosen}
                    aria-setsize={items.length}
                    aria-posinset={index + 1}
                    aria-label={item.name}
                    title={size ? `${item.name}\n${size}` : item.name}
                    className={classNames(
                      "start-file-picker__tile",
                      index === active && "start-file-picker__tile--active",
                      chosen && "start-file-picker__tile--chosen",
                    )}
                    onPointerMove={() => onActivate(index)}
                    onClick={() => onPick(item)}
                  >
                    <span className="start-file-picker__media">
                      {/* The gallery's own thumbnail, so it is usually cached already. */}
                      <img
                        src={galleryThumbnailPreviewUrl(item.path, item.modified_at, item.size)}
                        alt=""
                        loading="lazy"
                        draggable={false}
                      />
                      {item.duration != null && (
                        <span className="start-file-picker__duration">
                          {formatDurationSeconds(item.duration)}
                        </span>
                      )}
                      {chosen && (
                        <span className="start-file-picker__check" aria-hidden="true">
                          <Icon icon={iconCheck} />
                        </span>
                      )}
                    </span>
                    <MiddleTruncate text={item.name} className="start-file-picker__name" />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface StartFilePickerProps {
  kind: ComfySourceKind;
  value: string | null;
  /** The open folder's media; a saved set may point elsewhere and still runs. */
  items: readonly GalleryItem[];
  disabled: boolean;
  onChange: (path: string | null) => void;
}

/** Picks a start file by its picture. The search field keeps focus while the arrows move. */
export function StartFilePicker({ kind, value, items, disabled, onChange }: StartFilePickerProps) {
  const noun = kind === "image" ? "images" : "videos";
  const candidates = useMemo(
    () => items.filter((item) => matchesKind(item, kind)).sort(newestFirst),
    [items, kind],
  );
  const {
    open,
    close,
    menuId,
    rootRef,
    panelRef,
    triggerProps,
    needle,
    activeOf,
    setActive,
    listId,
    optionId,
    searchRef,
    searchProps,
    handleRootKeyDown,
  } = useSearchPopup({
    opensAt: () => candidates.findIndex((item) => item.path === value),
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const matches = useMemo(
    () =>
      needle ? candidates.filter((item) => item.name.toLowerCase().includes(needle)) : candidates,
    [candidates, needle],
  );

  const pick = (item: GalleryItem) => {
    onChange(item.path);
    close();
  };

  const chosen = value === null ? null : items.find((item) => item.path === value);
  const name = value === null ? null : folderLeafName(value);

  const total = `${candidates.length} ${candidates.length === 1 ? kind : noun}`;
  let meta = `Choose one of this folder's ${noun}`;
  if (chosen) meta = dimensions(chosen) ?? "Choose another";
  else if (value !== null) meta = `In ${folderLeafName(parentFolderPath(value))}`;

  return (
    /* oxlint-disable-next-line
       jsx-a11y/no-static-element-interactions
       -- catches Escape from the trigger and panel */
    <div ref={rootRef} className="start-file-picker" onKeyDown={handleRootKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className="start-file-picker__trigger"
        aria-label={`Start ${kind}: ${name ?? "none"}`}
        disabled={disabled}
        {...triggerProps}
        aria-haspopup="dialog"
      >
        <span className="start-file-picker__thumb" aria-hidden="true">
          {value === null ? (
            <Icon icon={iconImage} />
          ) : (
            <img src={optionalThumbnailUrl(value, 256)} alt="" />
          )}
        </span>
        <span className="start-file-picker__text">
          {name === null ? (
            <span className="start-file-picker__title">No start {kind}</span>
          ) : (
            <MiddleTruncate text={name} className="start-file-picker__title" />
          )}
          <span className="start-file-picker__meta">{meta}</span>
        </span>
        <Icon icon={iconChevronDown} className="start-file-picker__chevron" />
      </button>
      {value !== null && (
        <IconButton
          icon={iconX}
          label={`Remove start ${kind}`}
          size="xs"
          variant="ghost"
          tone="danger"
          disabled={disabled}
          onClick={() => {
            onChange(null);
            // This button leaves with the file, and would take the focus along.
            triggerRef.current?.focus();
          }}
        />
      )}
      <AnchoredLayer
        anchorRef={rootRef}
        floatingRef={panelRef}
        open={open}
        exitDuration={DURATION_INSTANT_MS}
        id={menuId}
        className="start-file-picker__panel"
        role="dialog"
        label={`Choose a start ${kind}`}
        placement="top-end"
      >
        <div className="start-file-picker__head">
          <SearchInput
            ref={searchRef}
            label={`Search ${noun}`}
            placeholder={`Search ${noun}`}
            className="start-file-picker__search"
            {...searchProps({
              count: matches.length,
              columns: START_FILE_COLUMNS,
              onPick: (index) => pick(matches[index]),
            })}
          />
          <span className="start-file-picker__count" aria-live="polite">
            {needle ? `${matches.length} of ${candidates.length}` : total}
          </span>
        </div>
        <TileGrid
          items={matches}
          value={value}
          active={activeOf(matches.length)}
          listId={listId}
          optionId={optionId}
          label={kind === "image" ? "Images" : "Videos"}
          emptyText={needle ? `No ${noun} match.` : `This folder has no ${noun}.`}
          onActivate={setActive}
          onPick={pick}
        />
      </AnchoredLayer>
    </div>
  );
}
