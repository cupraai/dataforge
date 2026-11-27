import { ProgressBar } from "@/shared/ui/ProgressBar";
import { IconButton } from "@/shared/ui/IconButton";
import { iconBan, iconBrain, iconDot, iconHourglass, iconLoader2 } from "@/shared/icons";
import type { ExternalOstrisJob } from "@/shared/types";
import {
  externalJobModelLabel,
  externalJobProgressPercent,
  externalJobRemainingTimeLabel,
  externalJobStatusLabel,
} from "@/features/jobs/lib/externalJobs";
import { useExternalTrainingSamples } from "@/features/jobs/hooks/useTrainingSamples";
import { classNames } from "@/shared/lib/classNames";
import { Badge } from "@/shared/ui/Badge";
import { Icon } from "@/shared/ui/Icon";
import { TrainingSamples } from "./TrainingSamples";
import { Tooltip } from "@/shared/ui/Tooltip";

interface ExternalJobCardProps {
  job: ExternalOstrisJob;
  isCurrentFolder?: boolean;
  onOpenFolder?: (folderPath: string) => void;
  onStop?: (jobId: string) => void;
  stopping?: boolean;
  onLightboxOpenChange?: (open: boolean) => void;
}

export function ExternalJobCard({
  job,
  isCurrentFolder = false,
  onOpenFolder,
  onStop,
  stopping = false,
  onLightboxOpenChange,
}: ExternalJobCardProps) {
  const progress = externalJobProgressPercent(job);
  const samples = useExternalTrainingSamples(job);
  const remainingTime = externalJobRemainingTimeLabel(job);
  const datasetFolder = job.dataset_folder;
  const canOpenDataset = Boolean(datasetFolder && onOpenFolder);
  // A queued run can sit in AI-Toolkit's queue for a long time with nothing happening yet.
  const waiting = job.status === "queued" && !stopping;
  return (
    <article
      className={classNames(
        "job-card job-card--external",
        waiting ? "job-card--queued" : "job-card--active",
        isCurrentFolder && "job-card--current",
      )}
      aria-label={`external job ${job.name}`}
    >
      <div className="job-card__header">
        {canOpenDataset ? (
          <Tooltip content={`Open ${datasetFolder}`}>
            <button
              type="button"
              className="job-card__folder"
              onClick={() => onOpenFolder?.(datasetFolder!)}
            >
              <Icon icon={iconBrain} className="job-card__folder-icon" />
              <span className="job-card__folder-name">{job.name}</span>
            </button>
          </Tooltip>
        ) : (
          <div className="job-card__folder job-card__folder--static">
            <Icon icon={iconBrain} className="job-card__folder-icon" />
            <Tooltip content={job.name} whenTruncated>
              <span className="job-card__folder-name">{job.name}</span>
            </Tooltip>
          </div>
        )}

        <div className="job-card__header-actions">
          <Badge
            tone="accent"
            icon={waiting ? iconHourglass : iconLoader2}
            spin={!waiting}
            className={waiting ? "job-card__badge--queued" : undefined}
          >
            {externalJobStatusLabel(job, stopping)}
          </Badge>

          {onStop && (
            <IconButton
              icon={iconBan}
              label={`Stop job ${job.name}`}
              tooltip={
                stopping
                  ? job.save_now
                    ? "Saving checkpoint..."
                    : "Stopping job..."
                  : "Stop job and save checkpoint"
              }
              size="xs"
              tone="warning"
              busy={stopping}
              onClick={() => onStop(job.id)}
            />
          )}
        </div>
      </div>

      <div className="job-card__source">
        {externalJobModelLabel(job)}
        {job.info && (
          <>
            <Icon icon={iconDot} className="job-card__source-separator app-icon--dot" />
            {job.info}
          </>
        )}
      </div>

      {waiting ? (
        <p className="job-card__waiting">
          <Icon icon={iconHourglass} className="job-card__waiting-icon" />
          <span className="job-card__waiting-text">Waiting in the AI-Toolkit queue</span>
        </p>
      ) : (
        <>
          <div className="job-card__meta">
            <span className="job-card__meta-count">
              {job.step}/{job.total_steps ?? "..."}
            </span>
            {remainingTime && <span className="job-card__remaining">{remainingTime}</span>}
          </div>

          <ProgressBar
            className="job-card__progress"
            value={progress}
            label={`Progress for ${job.name}`}
          />
        </>
      )}

      <TrainingSamples samples={samples} compact onLightboxOpenChange={onLightboxOpenChange} />
    </article>
  );
}
