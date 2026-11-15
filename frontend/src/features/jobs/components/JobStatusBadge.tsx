import type { Job } from "@/shared/types";
import {
  iconBan,
  iconCircleAlert,
  iconCircleCheck,
  iconHourglass,
  iconLoader2,
  iconTriangleAlert,
} from "@/shared/icons";
import { Badge, type BadgeTone } from "@/shared/ui/Badge";
import {
  isActiveJobStatus,
  jobIsCancelled,
  jobShowsErrorState,
  jobShowsWarningState,
  jobStatusTone,
  statusLabel,
  type JobStatusTone,
} from "@/features/jobs/lib/jobs";

const BADGE_TONES: Record<JobStatusTone, BadgeTone> = {
  active: "accent",
  queued: "accent",
  success: "success",
  danger: "danger",
  warning: "warning",
  muted: "neutral",
};

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
    <Badge
      tone={BADGE_TONES[jobStatusTone(job)]}
      icon={icon}
      spin={active}
      className={queued ? "job-card__badge--queued" : undefined}
    >
      {statusLabel(job)}
    </Badge>
  );
}
