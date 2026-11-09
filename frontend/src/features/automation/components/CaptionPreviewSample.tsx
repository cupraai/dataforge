import { useMemo } from "react";
import { collapseDiffContext, diffCaptionWords } from "@/shared/lib/captionWordDiff";
import {
  CaptionDiffBadge,
  CaptionDiffHeading,
  CaptionDiffStat,
  CaptionDiffView,
} from "@/shared/ui/CaptionWordDiff";

interface CaptionPreviewSampleProps {
  name: string;
  before: string;
  after?: string | null;
  error?: string | null;
  /** Unchanged text kept around each change; omit to show the whole caption. */
  contextChars?: number;
}

/** What a caption job would do to one file, as a list item. */
export function CaptionPreviewSample({
  name,
  before,
  after = null,
  error,
  contextChars,
}: CaptionPreviewSampleProps) {
  const segments = useMemo(
    () => (after === null ? null : diffCaptionWords(before, after)),
    [after, before],
  );
  const shown = useMemo(
    () =>
      segments && contextChars !== undefined
        ? collapseDiffContext(segments, contextChars)
        : segments,
    [contextChars, segments],
  );

  return (
    <li className="caption-preview-sample">
      <CaptionDiffHeading name={name} stat={segments && <CaptionDiffStat segments={segments} />}>
        {after !== null && before === after && (
          <CaptionDiffBadge tone="neutral">Unchanged</CaptionDiffBadge>
        )}
        {error && <CaptionDiffBadge tone="error">Failed</CaptionDiffBadge>}
      </CaptionDiffHeading>
      {shown && <CaptionDiffView segments={shown} />}
      {error && <p className="caption-preview-sample__error">{error}</p>}
    </li>
  );
}
