import type { Job } from "@/shared/types";
import {
  iconBan,
  iconCircleAlert,
  iconCircleCheck,
  iconHourglass,
  iconLoader2,
  iconTriangleAlert,
} from "@/shared/icons";
import { classNames } from "@/shared/lib/classNames";
import { Icon } from "@/shared/ui/Icon";
import {
  isActiveJobStatus,
  jobIsCancelled,
  jobShowsErrorState,
  jobShowsWarningState,
  jobStatusTone,
  statusLabel,
} from "@/features/jobs/lib/jobs";

export function JobStatusBadge({ job }: { job: Job }) {
  // Waiting is not working: a spinner would say the job is doing something.
  const queued = job.status === "queued";
  const active = isActiveJobStatus(job.status) && !queued;
  const icon = queued
    ? iconHourglass
    : active
      ? iconLoader2
      : jobShowsErrorState(job)
        ? iconCircleAlert
        : jobShowsWarningState(job)
          ? iconTriangleAlert
          : jobIsCancelled(job)
            ? iconBan
            : iconCircleCheck;
  return (
    <span className={`job-card__badge job-card__badge--${jobStatusTone(job)}`}>
      <Icon
        icon={icon}
        className={classNames("job-card__badge-icon", active && "job-card__badge-icon--spin")}
      />
      <span className="job-card__badge-label">{statusLabel(job)}</span>
    </span>
  );
}
