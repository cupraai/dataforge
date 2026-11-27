import { Button } from "@/shared/ui/Button";
import { jobTypeIconFor } from "@/features/jobs/lib/jobMeta";
import { SearchInput } from "@/shared/ui/SearchInput";
import { SegmentedControl } from "@/shared/ui/SegmentedControl";
import { GuardedDialog } from "@/shared/ui/GuardedDialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useDeferredValue, useEffect, useId, useMemo, useState } from "react";
import { previewCaptionRestore } from "@/features/automation/api/jobs";
import { folderKey } from "@/features/folder/lib/folderPath";
import { saveCaption } from "@/features/gallery/api/captions";
import { thumbnailUrl } from "@/features/gallery/api/media";
import { CAPTION_BACKUP_DIR_NAME } from "@/shared/constants";
import {
  iconAlertTriangle,
  iconArchiveRestore,
  iconCircleCheck,
  iconColumns2,
  iconFilterX,
  iconImage,
  iconRefresh,
  iconRows3,
  type AppIcon,
} from "@/shared/icons";
import { classNames } from "@/shared/lib/classNames";
import { diffCaptionWords } from "@/shared/lib/captionWordDiff";
import { formatCount } from "@/shared/lib/format";
import { readStored, writeStored } from "@/shared/lib/storage";
import { formatApiError, isApiErrorCode } from "@/shared/api/http";
import type { CaptionBackupCompareSample, RestoreCaptionsPreviewResponse } from "@/shared/types";
import {
  CaptionDiffBadge,
  CaptionDiffHeading,
  CaptionDiffLegend,
  CaptionDiffSplit,
  CaptionDiffStat,
  CaptionDiffView,
  type CaptionDiffLayout,
} from "@/shared/ui/CaptionWordDiff";
import { DialogActions } from "@/shared/ui/Dialog";
import type { DialogScopeInfo } from "@/shared/ui/DialogScope";
import { EmptyState } from "@/shared/ui/EmptyState";
import { Icon } from "@/shared/ui/Icon";

const LAYOUT_STORAGE_KEY = "restore-captions-diff-layout";
// The gallery's size, so the thumbnails are usually cached already and stay sharp at 2x.
const THUMBNAIL_WIDTH = 400;

const LAYOUT_OPTIONS: ReadonlyArray<{ value: CaptionDiffLayout; label: string; icon: AppIcon }> = [
  { value: "inline", label: "Inline", icon: iconRows3 },
  { value: "split", label: "Side by side", icon: iconColumns2 },
];

type SampleKind = "changed" | "new" | "unreadable";
type KindFilter = "all" | SampleKind;

const FILTER_OPTIONS: ReadonlyArray<{ value: KindFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "changed", label: "Changed" },
  { value: "new", label: "New" },
  { value: "unreadable", label: "Unreadable" },
];

interface ReviewedSample {
  sample: CaptionBackupCompareSample;
  kind: SampleKind;
  /** Lowercased name and both captions, for the search box. */
  haystack: string;
}

function kindOf(sample: CaptionBackupCompareSample): SampleKind {
  if (sample.error) return "unreadable";
  return sample.current === null || sample.current === undefined ? "new" : "changed";
}

function withoutKey(set: ReadonlySet<string>, key: string): ReadonlySet<string> {
  const next = new Set(set);
  next.delete(key);
  return next;
}

function readLayout(): CaptionDiffLayout {
  return readStored(LAYOUT_STORAGE_KEY) === "split" ? "split" : "inline";
}

function plural(count: number, one: string, many: string): string {
  return `${formatCount(count)} ${count === 1 ? one : many}`;
}

interface RestoreCaptionsDialogProps {
  scope: DialogScopeInfo;
  folderPath: string;
  /** The files the restore will run on, so the preview compares exactly those. */
  selectedPaths?: string[];
  busy?: boolean;
  /** Replaces the start label, as when the dialog edits a workflow step instead. */
  confirmLabel?: string;
  /** Offers a Restore button per caption, which writes at once; off when editing a step. */
  canRestoreOne?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function RestoreCaptionsDialog({
  scope,
  folderPath,
  selectedPaths,
  busy = false,
  confirmLabel,
  canRestoreOne = false,
  onConfirm,
  onCancel,
}: RestoreCaptionsDialogProps) {
  const queryClient = useQueryClient();
  const previewKey = ["restore-preview", folderKey(folderPath), selectedPaths ?? null];
  const preview = useQuery({
    queryKey: previewKey,
    queryFn: ({ signal }) => previewCaptionRestore(folderPath, selectedPaths, signal),
    retry: false,
  });
  const differing = preview.data ? preview.data.changed + preview.data.missing : null;
  // A failed or pending preview never blocks the restore; only a known no-op does.
  const nothingToRestore = differing === 0;

  return (
    <GuardedDialog
      role="alertdialog"
      confirmDisabled={nothingToRestore}
      scope={scope}
      icon={jobTypeIconFor("restore_captions")}
      title="Restore captions from backup?"
      description={
        <>
          Replaces the current captions with their copies in{" "}
          <strong>{CAPTION_BACKUP_DIR_NAME}</strong>. Files without a backup keep their caption, and
          the backup itself stays in place.
        </>
      }
      panelClassName="restore-captions-dialog"
      busy={busy}
      onConfirm={nothingToRestore ? undefined : onConfirm}
      onClose={onCancel}
      footer={
        <DialogActions
          confirmLabel={
            confirmLabel ??
            (differing ? `Restore ${plural(differing, "caption", "captions")}` : "Restore captions")
          }
          busyLabel="Starting..."
          onCancel={onCancel}
        />
      }
    >
      <div className="restore-captions-dialog__body">
        {preview.isError ? (
          <EmptyState
            icon={iconAlertTriangle}
            variant="error"
            role="alert"
            title="Could not compare with the backup"
            description={`${formatApiError(preview.error)} You can still restore without reviewing.`}
            action={
              <Button
                icon={iconRefresh}
                busy={preview.isFetching}
                onClick={() => void preview.refetch()}
              >
                Try again
              </Button>
            }
          />
        ) : !preview.data ? (
          <RestoreSkeleton />
        ) : differing === 0 ? (
          <EmptyState
            icon={iconCircleCheck}
            variant="success"
            role="status"
            title="Every caption matches the backup"
            description={skippedNote(preview.data) || "Restoring would change nothing."}
          />
        ) : (
          <RestoreReview
            preview={preview.data}
            onRestoreOne={
              canRestoreOne
                ? async (sample) => {
                    await restoreOneCaption(sample);
                    queryClient.setQueryData<RestoreCaptionsPreviewResponse>(previewKey, (data) =>
                      data ? withoutSample(data, sample) : data,
                    );
                  }
                : undefined
            }
            onStale={() => void preview.refetch()}
          />
        )}
      </div>
    </GuardedDialog>
  );
}

/** Writes against the compared revision, so a caption edited since then is left alone. */
async function restoreOneCaption(sample: CaptionBackupCompareSample): Promise<void> {
  await saveCaption(sample.path, sample.backup, { baseRevision: sample.revision ?? null });
}

/** The preview once `sample` matches its backup, so the list, counts and label follow. */
function withoutSample(
  response: RestoreCaptionsPreviewResponse,
  sample: CaptionBackupCompareSample,
): RestoreCaptionsPreviewResponse {
  const counted = kindOf(sample) === "new" ? "missing" : "changed";
  return {
    ...response,
    [counted]: Math.max(0, response[counted] - 1),
    unchanged: response.unchanged + 1,
    samples: response.samples.filter((entry) => entry.path !== sample.path),
  };
}

/** What the restore leaves alone, or an empty string when it touches every backup. */
function skippedNote(preview: RestoreCaptionsPreviewResponse): string {
  const parts = [
    preview.unchanged > 0 &&
      plural(preview.unchanged, "caption already matches", "captions already match"),
    preview.orphaned > 0 &&
      `${plural(preview.orphaned, "backup has", "backups have")} no media and will be skipped`,
  ].filter(Boolean);
  return parts.length > 0 ? `${parts.join(" · ")}.` : "";
}

interface RestoreOne {
  restore: (sample: CaptionBackupCompareSample) => void;
  restoring: ReadonlySet<string>;
  errors: ReadonlyMap<string, string>;
}

function RestoreReview({
  preview,
  onRestoreOne,
  onStale,
}: {
  preview: RestoreCaptionsPreviewResponse;
  /** Restores one caption; rejects when nothing was written. */
  onRestoreOne?: (sample: CaptionBackupCompareSample) => Promise<void>;
  /** The comparison no longer matches the files, as after a conflict. */
  onStale: () => void;
}) {
  const [layout, setLayout] = useState(readLayout);
  const [restoring, setRestoring] = useState<ReadonlySet<string>>(() => new Set());
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [filter, setFilter] = useState<KindFilter>("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const filterName = useId();

  const reviewed = useMemo<ReviewedSample[]>(
    () =>
      preview.samples.map((sample) => ({
        sample,
        kind: kindOf(sample),
        haystack: `${sample.name}\n${sample.current ?? ""}\n${sample.backup}`.toLowerCase(),
      })),
    [preview.samples],
  );
  const counts = useMemo(() => {
    const result: Record<KindFilter, number> = { all: 0, changed: 0, new: 0, unreadable: 0 };
    for (const entry of reviewed) {
      result.all += 1;
      result[entry.kind] += 1;
    }
    return result;
  }, [reviewed]);
  const visible = useMemo(
    () =>
      reviewed.filter(
        (entry) =>
          (filter === "all" || entry.kind === filter) &&
          (!deferredQuery || entry.haystack.includes(deferredQuery)),
      ),
    [deferredQuery, filter, reviewed],
  );
  // Restoring the last caption of a kind takes its chip away; the list falls back to all.
  if (filter !== "all" && counts[filter] === 0) setFilter("all");
  const narrowed = filter !== "all" || query.trim() !== "";
  const skipped = skippedNote(preview);

  const changeLayout = (next: CaptionDiffLayout) => {
    setLayout(next);
    writeStored(LAYOUT_STORAGE_KEY, next);
  };
  const clearFilters = () => {
    setFilter("all");
    setQuery("");
  };
  const restoreOne: RestoreOne | undefined = onRestoreOne && {
    restoring,
    errors,
    restore: (sample) => {
      if (restoring.has(sample.path)) return;
      const settle = (error: string | null) => {
        setRestoring((current) => withoutKey(current, sample.path));
        setErrors((current) => {
          const next = new Map(current);
          if (error) next.set(sample.path, error);
          else next.delete(sample.path);
          return next;
        });
      };
      setRestoring((current) => new Set(current).add(sample.path));
      onRestoreOne(sample).then(
        () => settle(null),
        (error: unknown) => {
          if (isApiErrorCode(error, "caption_conflict")) {
            settle("The caption changed since the comparison, so it was not restored.");
            onStale();
          } else {
            settle(formatApiError(error));
          }
        },
      );
    },
  };

  return (
    <div className="restore-captions-dialog__review">
      <div className="restore-captions-dialog__toolbar">
        <div className="restore-captions-dialog__filters" role="radiogroup" aria-label="Show">
          {FILTER_OPTIONS.filter(
            (option) => option.value === "all" || counts[option.value] > 0,
          ).map((option) => (
            <label
              key={option.value}
              className={classNames(
                "restore-captions-dialog__filter",
                `restore-captions-dialog__filter--${option.value}`,
                filter === option.value && "restore-captions-dialog__filter--active",
              )}
            >
              <input
                type="radio"
                name={filterName}
                className="restore-captions-dialog__radio"
                value={option.value}
                checked={filter === option.value}
                onChange={() => setFilter(option.value)}
              />
              <span className="restore-captions-dialog__filter-label">{option.label}</span>
              <span className="restore-captions-dialog__filter-count">
                {formatCount(counts[option.value])}
              </span>
            </label>
          ))}
        </div>

        <div className="restore-captions-dialog__tools">
          <SearchInput
            label="Filter by file name or caption text"
            clearLabel="Clear the filter"
            placeholder="Filter by file or caption..."
            className="restore-captions-dialog__search"
            value={query}
            onChange={setQuery}
            onKeyDown={(event) => {
              // Enter would otherwise confirm the dialog and start the restore.
              if (event.key === "Enter") event.preventDefault();
              // Escape clears the search before it closes the dialog.
              if (event.key === "Escape" && query) {
                event.preventDefault();
                event.stopPropagation();
                setQuery("");
              }
            }}
          />

          <SegmentedControl
            label="Diff view"
            value={layout}
            options={LAYOUT_OPTIONS}
            onChange={changeLayout}
          />
        </div>
      </div>

      <div className="restore-captions-dialog__list">
        {/* Same grid as a row, so each label sits exactly over its column. */}
        <div className="restore-captions-dialog__list-header">
          {layout === "split" ? (
            <CaptionDiffLegend
              className="restore-captions-dialog__columns"
              removed="Current caption"
              added="After restore"
            />
          ) : (
            <CaptionDiffLegend
              removed="Only in the current caption"
              added="Restored from the backup"
            />
          )}
        </div>

        {visible.length > 0 ? (
          // Remounted per layout, so no row keeps a height measured for the other one.
          <RestoreSampleList
            key={layout}
            entries={visible}
            narrowing={`${filter}\n${deferredQuery}`}
            layout={layout}
            restoreOne={restoreOne}
          />
        ) : (
          <div className="restore-captions-dialog__no-match">
            <p>
              No differing caption matches
              {query.trim() ? <> “{query.trim()}”</> : " this filter"}.
            </p>
            <Button icon={iconFilterX} onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
        )}
      </div>

      <p className="restore-captions-dialog__footnote">
        <span role="status">
          {narrowed
            ? `Showing ${formatCount(visible.length)} of ${formatCount(counts.all)}`
            : `${plural(counts.all, "caption differs", "captions differ")} from the backup`}
          .
        </span>
        {skipped && <> {skipped}</>}
      </p>
    </div>
  );
}

function RestoreSkeleton() {
  return (
    <div
      className="restore-captions-dialog__list restore-captions-dialog__list--loading"
      role="status"
      aria-label="Comparing with the backup..."
    >
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="restore-captions-dialog__skeleton-row" aria-hidden="true">
          <span className="restore-captions-dialog__thumb skeleton-shimmer" />
          <span className="restore-captions-dialog__skeleton-lines">
            <span className="skeleton-shimmer" />
            <span className="skeleton-shimmer" />
          </span>
        </div>
      ))}
    </div>
  );
}

// Row estimates from the stylesheets; every row is measured.
const ROW_PADDING_Y_PX = 25;
const THUMB_PX = 96;
const HEADER_PX = 26;
// The heading grows to the height of its Restore button.
const HEADER_WITH_ACTION_PX = 30;
const LINE_PX = 22.4;
const ROW_INSET_X_PX = 138;
// The split frame's border and each side's padding.
const SPLIT_FRAME_Y_PX = 16;
const SPLIT_SIDE_X_PX = 25;
const AVERAGE_CHAR_PX = 6.8;

function estimateRowHeight(
  entry: ReviewedSample | undefined,
  layout: CaptionDiffLayout,
  listWidth: number,
  withAction: boolean,
): number {
  if (!entry) return ROW_PADDING_Y_PX + THUMB_PX;
  const { sample } = entry;
  const textWidth = Math.max(listWidth - ROW_INSET_X_PX, 240);
  const current = sample.current ?? "";
  const longer = Math.max(current.length, sample.backup.length);
  const [chars, width] =
    layout === "split"
      ? [longer, textWidth / 2 - SPLIT_SIDE_X_PX]
      : // Inline shows the shared text once, plus whatever each side alone has.
        [Math.ceil(longer * 1.15), textWidth];
  const lines = Math.max(1, Math.ceil((chars * AVERAGE_CHAR_PX) / width));
  const sides = layout === "split" ? SPLIT_FRAME_Y_PX : 0;
  const header = withAction ? HEADER_WITH_ACTION_PX : HEADER_PX;
  return ROW_PADDING_Y_PX + Math.max(THUMB_PX, header + lines * LINE_PX + sides);
}

/** Every differing caption, rendered only around the scroll position; rows size to their text. */
function RestoreSampleList({
  entries,
  narrowing,
  layout,
  restoreOne,
}: {
  entries: ReviewedSample[];
  /** Changes with the filters, never with a restored caption leaving the list. */
  narrowing: string;
  layout: CaptionDiffLayout;
  restoreOne?: RestoreOne;
}) {
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  // Flags TanStack Virtual for the React Compiler, which this app does not use.
  // oxlint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollElement,
    estimateSize: (index) =>
      estimateRowHeight(
        entries[index],
        layout,
        scrollElement?.clientWidth ?? 0,
        restoreOne !== undefined,
      ),
    overscan: 8,
    getItemKey: (index) => entries[index]?.sample.path ?? index,
    // A synchronous commit inside the observer callback triggers the ResizeObserver loop error.
    useFlushSync: false,
  });

  // A narrowed list starts from its first match rather than an offset into the old one.
  useEffect(() => {
    if (scrollElement) scrollElement.scrollTop = 0;
  }, [narrowing, scrollElement]);

  return (
    <div ref={setScrollElement} className="restore-captions-dialog__scroller">
      <div
        role="list"
        aria-label="Captions that differ from the backup"
        className="restore-captions-dialog__rows"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((row) => {
          const entry = entries[row.index];
          if (!entry) return null;
          return (
            <RestoreRow
              key={row.key}
              ref={virtualizer.measureElement}
              index={row.index}
              start={row.start}
              entry={entry}
              layout={layout}
              restoreOne={restoreOne}
            />
          );
        })}
      </div>
    </div>
  );
}

function RestoreRow({
  ref,
  index,
  start,
  entry,
  layout,
  restoreOne,
}: {
  ref: (element: HTMLElement | null) => void;
  index: number;
  start: number;
  entry: ReviewedSample;
  layout: CaptionDiffLayout;
  restoreOne?: RestoreOne;
}) {
  const { sample, kind } = entry;
  const restoreError = restoreOne?.errors.get(sample.path);
  const { current, backup } = sample;
  const segments = useMemo(() => diffCaptionWords(current ?? "", backup), [backup, current]);

  return (
    <div
      ref={ref}
      data-index={index}
      role="listitem"
      aria-label={sample.name}
      className={classNames(
        "restore-captions-dialog__row",
        `restore-captions-dialog__row--${kind}`,
      )}
      style={{ transform: `translateY(${start}px)` }}
    >
      <RestoreThumbnail sample={sample} />
      <div className="restore-captions-dialog__row-main">
        <CaptionDiffHeading
          name={sample.name}
          stat={
            kind !== "unreadable" && <CaptionDiffStat segments={segments} addedVerb="restored" />
          }
          action={
            restoreOne && (
              <Button
                icon={iconArchiveRestore}
                size="xs"
                busy={restoreOne.restoring.has(sample.path)}
                aria-label={`Restore the backed up caption for ${sample.name}`}
                onClick={() => restoreOne.restore(sample)}
              >
                Restore
              </Button>
            )
          }
        >
          {kind === "new" && <CaptionDiffBadge tone="added">New caption</CaptionDiffBadge>}
          {kind === "unreadable" && <CaptionDiffBadge tone="error">Unreadable</CaptionDiffBadge>}
        </CaptionDiffHeading>
        {sample.error && layout === "split" ? (
          <CaptionDiffSplit beforeError before={`${sample.error}.`} after={sample.backup} />
        ) : sample.error ? (
          <p className="caption-diff restore-captions-dialog__error">
            {sample.error}. Restoring replaces it with the backup:{" "}
            <span className="restore-captions-dialog__error-backup">{sample.backup}</span>
          </p>
        ) : (
          <CaptionDiffView segments={segments} layout={layout} emptySideLabel="No caption" />
        )}
        {restoreError && (
          <p className="restore-captions-dialog__restore-error" role="alert">
            {restoreError}
          </p>
        )}
      </div>
    </div>
  );
}

function RestoreThumbnail({ sample }: { sample: CaptionBackupCompareSample }) {
  const [failed, setFailed] = useState(false);

  return (
    <span className="restore-captions-dialog__thumb" aria-hidden="true">
      {failed ? (
        <Icon icon={iconImage} className="restore-captions-dialog__thumb-icon" />
      ) : (
        <img
          src={thumbnailUrl(sample.path, THUMBNAIL_WIDTH, sample.version ?? undefined)}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
