import type { ReactNode, Ref } from "react";
import { CaptionPreviewSample } from "@/features/automation/components/CaptionPreviewSample";
import { classNames } from "@/shared/lib/classNames";

// Enough unchanged text to place each change, short enough to keep several files in view.
const PREVIEW_CONTEXT_CHARS = 60;

export interface CaptionPreviewPanelSample {
  name: string;
  before: string;
  after?: string | null;
  error?: string | null;
}

interface CaptionPreviewPanelProps {
  /** The panel's first line: what the preview shows, or why it shows nothing. */
  summary: ReactNode;
  samples?: CaptionPreviewPanelSample[];
  /** Matching files the samples leave out. */
  more?: number;
  /** A request is in flight; whatever is shown is dimmed rather than cleared. */
  pending?: boolean;
  error?: boolean;
  ref?: Ref<HTMLDivElement>;
}

/**
 * The Preview field shared by the caption job dialogs. Its sample list is the dialog's one
 * scroller: it takes the height the form leaves and shrinks to a single sample before the
 * dialog itself would have to scroll.
 */
export function CaptionPreviewPanel({
  summary,
  samples = [],
  more = 0,
  pending = false,
  error = false,
  ref,
}: CaptionPreviewPanelProps) {
  return (
    <div className="dialog__field caption-preview-field">
      <div className="dialog__label">Preview</div>
      <div
        ref={ref}
        className={classNames(
          "caption-preview",
          error && "caption-preview--error",
          pending && "caption-preview--pending",
        )}
        // One live region for the whole panel: the summary and the samples always change
        // together, and announcing them separately would interleave them.
        role="status"
        aria-busy={pending || undefined}
      >
        <p className="caption-preview__summary">{summary}</p>
        {samples.length > 0 && (
          <ul className="caption-preview__samples">
            {samples.map((sample) => (
              <CaptionPreviewSample
                key={sample.name}
                {...sample}
                contextChars={PREVIEW_CONTEXT_CHARS}
              />
            ))}
            {more > 0 && <li className="caption-preview__more">and {more} more</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
