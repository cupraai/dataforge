import { Fragment, useMemo, type ReactNode } from "react";
import {
  countChangedWords,
  diffCaptionWords,
  type CaptionDiffSegment,
} from "@/shared/lib/captionWordDiff";
import { classNames } from "@/shared/lib/classNames";
import { formatCount } from "@/shared/lib/format";

export type CaptionDiffLayout = "inline" | "split";

interface CaptionWordDiffProps {
  before: string;
  after: string;
  /** What the two tints mean here; shown above the text with the changed-word counts. */
  legend: { removed: string; added: string };
  /** What the added words are called in the counts' tooltip, e.g. "restored". */
  addedVerb?: string;
}

/**
 * A complete comparison of two captions: `before` with the words `after` drops struck
 * through and the words it adds highlighted, under a line saying what the tints mean.
 */
export function CaptionWordDiff({ before, after, legend, addedVerb }: CaptionWordDiffProps) {
  const segments = useMemo(() => diffCaptionWords(before, after), [before, after]);
  return (
    <>
      <div className="caption-diff-summary">
        <CaptionDiffLegend removed={legend.removed} added={legend.added} />
        <CaptionDiffStat segments={segments} addedVerb={addedVerb} />
      </div>
      <CaptionDiffView segments={segments} />
    </>
  );
}

interface CaptionDiffViewProps {
  segments: CaptionDiffSegment[];
  layout?: CaptionDiffLayout;
  /** Split only: shown in a side that has no text, so it does not read as a gap. */
  emptySideLabel?: string;
  className?: string;
}

/** Renders segments already computed, for callers that also read them (word counts). */
export function CaptionDiffView({
  segments,
  layout = "inline",
  emptySideLabel,
  className,
}: CaptionDiffViewProps) {
  if (layout === "split") {
    return (
      <CaptionDiffSplit
        className={className}
        before={<SplitSide segments={segments} omit="added" emptyLabel={emptySideLabel} />}
        after={<SplitSide segments={segments} omit="removed" emptyLabel={emptySideLabel} />}
      />
    );
  }

  // A rewrite shares nothing, so the two captions stack instead of running together.
  const rewrite = segments.length === 2 && segments.every((segment) => segment.kind !== "same");
  return (
    <p className={classNames("caption-diff", rewrite && "caption-diff--rewrite", className)}>
      {renderSegments(segments)}
    </p>
  );
}

interface CaptionDiffSplitProps {
  before: ReactNode;
  after: ReactNode;
  /** Colours the `before` side as a problem rather than as the text being replaced. */
  beforeError?: boolean;
  className?: string;
}

/** The two-column frame, for callers whose sides are not both diffable text. */
export function CaptionDiffSplit({ before, after, beforeError, className }: CaptionDiffSplitProps) {
  return (
    <div className={classNames("caption-diff-split", className)}>
      <p
        className={classNames(
          "caption-diff caption-diff-split__side caption-diff-split__side--before",
          beforeError && "caption-diff-split__side--error",
        )}
      >
        {before}
      </p>
      <p className="caption-diff caption-diff-split__side caption-diff-split__side--after">
        {after}
      </p>
    </div>
  );
}

function SplitSide({
  segments,
  omit,
  emptyLabel,
}: {
  segments: CaptionDiffSegment[];
  omit: "removed" | "added";
  emptyLabel?: string;
}) {
  const empty = segments.every((segment) => segment.kind === omit || !segment.text.trim());
  if (empty && emptyLabel) return <span className="caption-diff-split__empty">{emptyLabel}</span>;
  // Nothing shared: marking every word adds noise once the side itself says what it is.
  const unrelated = !segments.some((segment) => segment.kind === "same" && segment.text.trim());
  if (unrelated) {
    return segments
      .filter((segment) => segment.kind !== omit)
      .map((segment) => segment.text)
      .join("");
  }
  return renderSegments(segments, omit);
}

function renderSegments(segments: CaptionDiffSegment[], omit?: "removed" | "added"): ReactNode[] {
  return segments.map((segment, index) => {
    if (segment.kind === omit) return null;
    if (segment.kind === "same") return segment.text;
    const previous = segments[index - 1];
    // A swap with nothing between its halves: the only place two marks touch.
    const flush =
      !omit &&
      segment.kind === "added" &&
      previous?.kind === "removed" &&
      !/\s$/.test(previous.text) &&
      !/^\s/.test(segment.text);
    return <ChangedText key={index} kind={segment.kind} text={segment.text} flush={flush} />;
  });
}

/** Tints the words only: a mark that carried its edge spaces would read as a wider change. */
function ChangedText({
  kind,
  text,
  flush,
}: {
  kind: "removed" | "added";
  text: string;
  flush: boolean;
}) {
  const Mark = kind === "removed" ? "del" : "ins";
  const className = classNames(`caption-diff__${kind}`, flush && "caption-diff__added--flush");
  const core = text.trim();
  if (!core) {
    // A whitespace-only change has no word to tint; a line break gets a visible stand-in.
    return (
      <Mark className={className}>
        {/[\r\n]/.test(text) && <span className="caption-diff__break" aria-hidden="true" />}
        {text}
      </Mark>
    );
  }
  const start = text.indexOf(core);
  return (
    <Fragment>
      {text.slice(0, start)}
      <Mark className={className}>{core}</Mark>
      {text.slice(start + core.length)}
    </Fragment>
  );
}

function words(count: number): string {
  return `${formatCount(count)} ${count === 1 ? "word" : "words"}`;
}

interface CaptionDiffStatProps {
  segments: CaptionDiffSegment[];
  /** What the added words are called where they come from somewhere, e.g. "restored". */
  addedVerb?: string;
  className?: string;
}

/** How many words each side alone has, as "−3 +5". Renders nothing for identical text. */
export function CaptionDiffStat({
  segments,
  addedVerb = "added",
  className,
}: CaptionDiffStatProps) {
  const { removed, added } = useMemo(() => countChangedWords(segments), [segments]);
  if (removed === 0 && added === 0) return null;
  return (
    <span
      className={classNames("caption-diff-stat", className)}
      title={`${words(removed)} removed, ${words(added)} ${addedVerb}`}
    >
      {removed > 0 && <span className="caption-diff-stat__removed">−{formatCount(removed)}</span>}
      {added > 0 && <span className="caption-diff-stat__added">+{formatCount(added)}</span>}
    </span>
  );
}

interface CaptionDiffLegendProps {
  removed: ReactNode;
  added: ReactNode;
  className?: string;
}

/** Says what the two tints mean in this view; also labels the columns of a split view. */
export function CaptionDiffLegend({ removed, added, className }: CaptionDiffLegendProps) {
  return (
    <div className={classNames("caption-diff-legend", className)}>
      <span className="caption-diff-legend__item caption-diff-legend__item--removed">
        {removed}
      </span>
      <span className="caption-diff-legend__item caption-diff-legend__item--added">{added}</span>
    </div>
  );
}

interface CaptionDiffHeadingProps {
  name: string;
  /** Badges after the name. */
  children?: ReactNode;
  /** Pushed to the far edge; usually a `CaptionDiffStat`. */
  stat?: ReactNode;
}

/** The line above one file's diff: its name, what kind of change it is, and how large. */
export function CaptionDiffHeading({ name, children, stat }: CaptionDiffHeadingProps) {
  return (
    <div className="caption-diff-heading">
      <span className="caption-diff-heading__name" title={name}>
        {name}
      </span>
      {children}
      {stat && <span className="caption-diff-heading__stat">{stat}</span>}
    </div>
  );
}

type CaptionDiffBadgeTone = "added" | "error" | "neutral";

export function CaptionDiffBadge({
  tone,
  children,
}: {
  tone: CaptionDiffBadgeTone;
  children: ReactNode;
}) {
  return <span className={`caption-diff-badge caption-diff-badge--${tone}`}>{children}</span>;
}
