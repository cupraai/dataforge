import { useId, useMemo, useRef, useState } from "react";
import { BUCKET_RANGES } from "@/features/gallery/lib/datasetStats";
import {
  RANGE_AXES,
  applyRanges,
  formatRange,
  isActiveRange,
  type GalleryRange,
  type GalleryRanges,
  type RangeAxis,
} from "@/features/gallery/lib/query";
import { iconX } from "@/shared/icons";
import { classNames } from "@/shared/lib/classNames";
import { formatCount } from "@/shared/lib/format";
import { Dialog, DialogActions, DialogButton } from "@/shared/ui/Dialog";
import { Icon } from "@/shared/ui/Icon";
import type { GalleryItem } from "@/shared/types";

const AXIS_FIELDS: Record<RangeAxis, { label: string; unit: string; none: string }> = {
  megapixels: { label: "Megapixels", unit: "MP", none: "No files here have a known resolution." },
  duration: { label: "Video duration", unit: "s", none: "No videos here have a known length." },
  caption_length: {
    label: "Caption length",
    unit: "chars",
    none: "No files here have caption text.",
  },
};

interface Draft {
  min: string;
  max: string;
}

type Drafts = Record<RangeAxis, Draft>;

function draftFrom(range: GalleryRange | null | undefined): Draft {
  return { min: String(range?.min ?? ""), max: String(range?.max ?? "") };
}

function draftsFrom(ranges: GalleryRanges): Drafts {
  const drafts = {} as Drafts;
  for (const axis of RANGE_AXES) drafts[axis] = draftFrom(ranges[axis]);
  return drafts;
}

/** `undefined` for an unusable bound, `null` for an empty one. A decimal comma is accepted. */
function parseBound(text: string): number | null | undefined {
  const trimmed = text.trim().replace(",", ".");
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function parseDraft(draft: Draft): { range: GalleryRange | null; error: string | null } {
  const min = parseBound(draft.min);
  const max = parseBound(draft.max);
  if (min === undefined || max === undefined) {
    return { range: null, error: "Enter a number of 0 or more." };
  }
  if (min !== null && max !== null && min >= max) {
    return { range: null, error: "The minimum must be below the maximum." };
  }
  return { range: min === null && max === null ? null : { min, max }, error: null };
}

const lower = (range: GalleryRange) => range.min ?? Number.NEGATIVE_INFINITY;
const upper = (range: GalleryRange) => range.max ?? Number.POSITIVE_INFINITY;

function covers(range: GalleryRange | null, bucket: GalleryRange): boolean {
  return isActiveRange(range) && lower(range) <= lower(bucket) && upper(bucket) <= upper(range);
}

/**
 * A bar click picks its bucket, extends a span to reach it, or, on the only picked bucket, clears.
 * Inside a wider span it narrows to that bucket, the quickest way back to one.
 */
function rangeAfterBarClick(range: GalleryRange | null, bucket: GalleryRange): GalleryRange | null {
  if (!isActiveRange(range)) return bucket;
  if (lower(range) === lower(bucket) && upper(range) === upper(bucket)) return null;
  if (covers(range, bucket)) return bucket;
  const min = Math.min(lower(range), lower(bucket));
  const max = Math.max(upper(range), upper(bucket));
  return { min: Number.isFinite(min) ? min : null, max: Number.isFinite(max) ? max : null };
}

interface RangeHistogramProps {
  axis: RangeAxis;
  items: GalleryItem[];
  range: GalleryRange | null;
  onPick: (range: GalleryRange | null) => void;
  /** The bar under the pointer or focus, so its span reads without a tooltip; `null` on leave. */
  onPreview: (label: string | null) => void;
}

function RangeHistogram({ axis, items, range, onPick, onPreview }: RangeHistogramProps) {
  const counts = useMemo(
    () => BUCKET_RANGES[axis].map((bucket) => applyRanges(items, { [axis]: bucket }).length),
    [axis, items],
  );
  const peak = Math.max(...counts);
  if (peak === 0) {
    return <p className="filter-ranges-dialog__empty">{AXIS_FIELDS[axis].none}</p>;
  }

  return (
    <div className="filter-ranges-dialog__histogram" role="group" aria-label="Pick from the chart">
      {BUCKET_RANGES[axis].map((bucket, index) => {
        const count = counts[index];
        const files = `${formatCount(count)} ${count === 1 ? "file" : "files"}`;
        const label = `${formatRange(axis, bucket)}: ${files}`;
        return (
          <button
            key={index}
            type="button"
            className={classNames(
              "filter-ranges-dialog__bar",
              covers(range, bucket) && "filter-ranges-dialog__bar--picked",
            )}
            aria-label={label}
            aria-pressed={covers(range, bucket)}
            onClick={() => onPick(rangeAfterBarClick(range, bucket))}
            onMouseEnter={() => onPreview(`${formatRange(axis, bucket)} · ${files}`)}
            onFocus={() => onPreview(`${formatRange(axis, bucket)} · ${files}`)}
            onMouseLeave={() => onPreview(null)}
            onBlur={() => onPreview(null)}
          >
            <span
              className="filter-ranges-dialog__bar-fill"
              style={{ height: `${(count / peak) * 100}%` }}
            />
          </button>
        );
      })}
    </div>
  );
}

interface FilterRangesDialogProps {
  ranges: GalleryRanges;
  /** The axis whose minimum gets focus, the one the user picked in the menu. */
  focusAxis: RangeAxis;
  /** What every filter but the ranges keeps: charted per axis and counted against the drafts. */
  rangeBaseItems: () => GalleryItem[];
  onApply: (ranges: GalleryRanges) => void;
  onClose: () => void;
}

export function FilterRangesDialog({
  ranges,
  focusAxis,
  rangeBaseItems,
  onApply,
  onClose,
}: FilterRangesDialogProps) {
  const [drafts, setDrafts] = useState(() => draftsFrom(ranges));
  const [preview, setPreview] = useState<{ axis: RangeAxis; label: string } | null>(null);
  const focusRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const items = useMemo(() => rangeBaseItems(), [rangeBaseItems]);

  const parsed = useMemo(() => {
    const next: GalleryRanges = {};
    const errors: Partial<Record<RangeAxis, string>> = {};
    for (const axis of RANGE_AXES) {
      const { range, error } = parseDraft(drafts[axis]);
      if (error) errors[axis] = error;
      else if (range) next[axis] = range;
    }
    return { ranges: next, errors };
  }, [drafts]);
  const valid = Object.keys(parsed.errors).length === 0;
  const matching = valid ? applyRanges(items, parsed.ranges).length : null;

  const setDraft = (axis: RangeAxis, draft: Draft) => {
    setDrafts((current) => ({ ...current, [axis]: draft }));
  };

  return (
    <Dialog
      title="Filter by range"
      panelClassName="filter-ranges-dialog"
      confirmDisabled={!valid}
      onConfirm={() => {
        onApply(parsed.ranges);
        onClose();
      }}
      onClose={onClose}
      initialFocusRef={focusRef}
      footer={
        <>
          <DialogButton
            label="Clear all"
            variant="secondary"
            onClick={() => setDrafts(draftsFrom({}))}
          />
          <DialogActions confirmLabel="Apply" onCancel={onClose} />
        </>
      }
    >
      <div className="filter-ranges-dialog__axes">
        {RANGE_AXES.map((axis) => {
          const { label, unit } = AXIS_FIELDS[axis];
          const labelId = `${baseId}-${axis}`;
          const errorId = `${baseId}-${axis}-error`;
          const error = parsed.errors[axis];
          const range = parsed.ranges[axis] ?? null;
          const draft = drafts[axis];
          const drafted = draft.min.trim() !== "" || draft.max.trim() !== "";
          const previewLabel = preview?.axis === axis ? preview.label : null;
          return (
            <section key={axis} className="filter-ranges-dialog__axis" aria-labelledby={labelId}>
              <header className="filter-ranges-dialog__axis-head">
                <h3 id={labelId} className="filter-ranges-dialog__axis-label">
                  {label}
                </h3>
                <span
                  className={classNames(
                    "filter-ranges-dialog__axis-summary",
                    previewLabel
                      ? "filter-ranges-dialog__axis-summary--preview"
                      : range && "filter-ranges-dialog__axis-summary--set",
                  )}
                >
                  {previewLabel ?? (range ? formatRange(axis, range) : "Any")}
                </span>
                {drafted && (
                  <button
                    type="button"
                    className="filter-ranges-dialog__axis-clear"
                    aria-label={`Any ${label.toLowerCase()}`}
                    title="Any"
                    onClick={() => setDraft(axis, draftFrom(null))}
                  >
                    <Icon icon={iconX} />
                  </button>
                )}
              </header>
              <div className="filter-ranges-dialog__axis-body">
                <RangeHistogram
                  axis={axis}
                  items={items}
                  range={range}
                  onPick={(picked) => setDraft(axis, draftFrom(picked))}
                  onPreview={(label) => setPreview(label ? { axis, label } : null)}
                />
                <div className="filter-ranges-dialog__bounds">
                  {(["min", "max"] as const).map((side) => (
                    <label key={side} className="filter-ranges-dialog__field">
                      <span className="filter-ranges-dialog__field-name">
                        {side === "min" ? "From" : "Below"}
                      </span>
                      <input
                        ref={axis === focusAxis && side === "min" ? focusRef : undefined}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        className="filter-ranges-dialog__input"
                        placeholder="Any"
                        aria-label={`${side === "min" ? "Minimum" : "Maximum"} ${label.toLowerCase()}`}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? errorId : undefined}
                        value={draft[side]}
                        onChange={(event) =>
                          setDraft(axis, { ...draft, [side]: event.target.value })
                        }
                      />
                      <span className="filter-ranges-dialog__unit" aria-hidden="true">
                        {unit}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              {error && (
                <p id={errorId} className="dialog__error">
                  {error}
                </p>
              )}
            </section>
          );
        })}
      </div>

      <p className="dialog__hint filter-ranges-dialog__count" role="status">
        {matching === null
          ? "Fix the ranges to see how many files match."
          : `${formatCount(matching)} ${matching === 1 ? "file matches" : "files match"}, with the other filters and search.`}
      </p>
    </Dialog>
  );
}
