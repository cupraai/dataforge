import { jobTypeLabel } from "@/features/jobs/lib/jobs";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import type { Job } from "@/shared/types";

interface CancelJobDialogProps {
  job: Job;
  /** Jobs queued behind a running `job`; the server cancels them with it. */
  queuedCount?: number;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Asked before any job is cancelled, from the toolbar or a job card. */
export function CancelJobDialog({
  job,
  queuedCount = 0,
  onConfirm,
  onCancel,
}: CancelJobDialogProps) {
  const label = jobTypeLabel(job);
  const folder = job.folder_name || job.folder;
  const waiting = job.status === "queued";
  const queue =
    queuedCount === 0
      ? ""
      : queuedCount === 1
        ? " The job queued after it is cancelled too."
        : ` The ${queuedCount} jobs queued after it are cancelled too.`;

  return (
    <ConfirmDialog
      title={`Cancel ${label.toLowerCase()} job?`}
      description={
        waiting
          ? `The job in "${folder}" has not started. Jobs queued after it still run.`
          : `The job in "${folder}" stops after the file it is working on. Files it already processed keep their results.${queue}`
      }
      confirmLabel="Cancel job"
      cancelLabel={waiting ? "Keep queued" : "Keep running"}
      confirmVariant="warning"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
