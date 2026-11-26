import { Badge } from "@/shared/ui/Badge";
import { DisclosureButton } from "@/shared/ui/Disclosure";
import { Button } from "@/shared/ui/Button";
import { useId, useState } from "react";
import { optionalThumbnailUrl } from "@/features/gallery/api/media";
import { useJobFileResults } from "@/features/jobs/hooks/useJobFileResults";
import {
  cancelledCountFromStats,
  countFailedResults,
  failedCountFromStats,
  failedResultPaths,
  groupResultsForDisplay,
  resultStatusLabel,
  resultToneOf,
  type ResultGroup,
  type ResultTone,
} from "@/features/jobs/lib/jobFileResults";
import { isActiveJobStatus } from "@/features/jobs/lib/jobs";
import {
  iconBan,
  iconCircleAlert,
  iconCircleCheck,
  iconCircleDashed,
  iconLoader2,
  iconRotateCcw,
  type AppIcon,
} from "@/shared/icons";
import { classNames } from "@/shared/lib/classNames";
import { Icon } from "@/shared/ui/Icon";
import type { Job, JobFileResult } from "@/shared/types";
import { Tooltip } from "@/shared/ui/Tooltip";

interface JobFileResultsProps {
  job: Job;
  onOpenItem?: (path: string) => void;
  onRetryFailed?: (paths: string[]) => void;
}

const TONE_ICONS: Record<ResultTone, AppIcon> = {
  failed: iconCircleAlert,
  cancelled: iconCircleDashed,
  done: iconCircleCheck,
  skipped: iconBan,
};

/** A cancelled run counts far more files than it has rows, so the remainder is stated in words. */
function unlistedNote(group: ResultGroup): string | null {
  const unlisted = group.count - group.results.length;
  if (unlisted <= 0) return null;
  if (group.results.length > 0) return `${unlisted} more never started.`;
  return unlisted === 1 ? "1 file never started." : `${unlisted} files never started.`;
}

function ResultRow({
  result,
  onOpenItem,
}: {
  result: JobFileResult;
  onOpenItem?: (path: string) => void;
}) {
  const tone = resultToneOf(result);
  const [thumbFailed, setThumbFailed] = useState(false);
  // A file the job made shows itself; the status still says it was done.
  const thumb = tone === "done" && result.preview && !thumbFailed ? result.preview : null;

  const content = (
    <>
      {thumb ? (
        <img
          className="job-file-results__thumb"
          src={optionalThumbnailUrl(thumb, 96)}
          alt=""
          loading="lazy"
          onError={() => setThumbFailed(true)}
        />
      ) : (
        <Icon icon={TONE_ICONS[tone]} className="job-file-results__row-icon" />
      )}
      <Tooltip content={result.name} whenTruncated>
        <span className="job-file-results__name">{result.name}</span>
      </Tooltip>
      <span className="job-file-results__status">{resultStatusLabel(result.status)}</span>
      {result.message && <span className="job-file-results__message">{result.message}</span>}
      {result.shared_with.length > 0 && (
        <span className="job-file-results__message">
          {`Caption shared with ${result.shared_with.join(", ")}`}
        </span>
      )}
    </>
  );

  return (
    <li className={classNames("job-file-results__row", `job-file-results__row--${tone}`)}>
      {onOpenItem ? (
        <button
          type="button"
          className="job-file-results__row-body job-file-results__row-body--action"
          // Names the row after the file alone, so the status and message stay out of the label.
          aria-label={result.name}
          onClick={() => onOpenItem(result.path)}
        >
          {content}
        </button>
      ) : (
        <div className="job-file-results__row-body">{content}</div>
      )}
    </li>
  );
}

export function JobFileResults({ job, onOpenItem, onRetryFailed }: JobFileResultsProps) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const { results, loading, failed } = useJobFileResults(job, expanded);

  if (isActiveJobStatus(job.status)) return null;

  const failedCount = failedCountFromStats(job.stats);
  const groups = groupResultsForDisplay(results, cancelledCountFromStats(job.stats));
  const retryPaths = failedResultPaths(results);
  const loadedFailedCount = countFailedResults(results);

  return (
    <div className="job-file-results">
      <DisclosureButton
        className="job-file-results__toggle"
        open={expanded}
        controls={panelId}
        label="Per-file results"
        onClick={() => setExpanded((current) => !current)}
        tabIndex={-1}
      >
        {failedCount > 0 && (
          <Badge tone="danger" className="job-file-results__chip">
            {failedCount} failed
          </Badge>
        )}
      </DisclosureButton>

      <div id={panelId} hidden={!expanded}>
        {expanded && (
          <div className="job-file-results__panel">
            {loading && (
              <p className="job-file-results__note">
                <Icon icon={iconLoader2} className="job-file-results__note-icon" spin />
                Loading results...
              </p>
            )}

            {failed && !loading && (
              <p className="job-file-results__alert" role="alert">
                <Icon icon={iconCircleAlert} className="job-file-results__alert-icon" />
                This job&apos;s results are no longer stored.
              </p>
            )}

            {!loading && !failed && groups.length === 0 && (
              <p className="job-file-results__note">This job recorded no per-file results.</p>
            )}

            {groups.length > 0 && (
              <div className="job-file-results__groups" data-scroll-lock-allow>
                {groups.map((group) => {
                  const unlisted = unlistedNote(group);

                  return (
                    <section key={group.tone} className="job-file-results__group">
                      <p
                        className={`job-file-results__group-label job-file-results__group-label--${group.tone}`}
                      >
                        {group.label}
                        <span className="job-file-results__group-count">{group.count}</span>
                      </p>
                      {group.results.length > 0 && (
                        <ul className="job-file-results__list">
                          {group.results.map((result) => (
                            <ResultRow key={result.path} result={result} onOpenItem={onOpenItem} />
                          ))}
                        </ul>
                      )}
                      {unlisted && <p className="job-file-results__group-note">{unlisted}</p>}
                    </section>
                  );
                })}
              </div>
            )}

            {onRetryFailed && !loading && loadedFailedCount > 0 && (
              <div className="job-file-results__actions">
                <Button
                  icon={iconRotateCcw}
                  variant="primary"
                  onClick={() => onRetryFailed(retryPaths)}
                  size="xs"
                >
                  Retry {loadedFailedCount} failed
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
