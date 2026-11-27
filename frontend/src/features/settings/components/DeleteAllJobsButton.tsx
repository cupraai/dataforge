import { useQuery } from "@tanstack/react-query";
import { fetchJobs } from "@/features/jobs/api/jobs";
import { useDeleteAllJobs } from "@/features/jobs/hooks/useDeleteAllJobs";
import { jobKeys } from "@/features/jobs/lib/jobQueries";
import { iconTrash2 } from "@/shared/icons";
import { formatCount } from "@/shared/lib/format";
import { Button } from "@/shared/ui/Button";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";

interface DeleteAllJobsButtonProps {
  /** Counting asks the server, so it waits until the section is first shown. */
  visible: boolean;
  disabled: boolean;
  /** Owned by the settings dialog, which goes inert while the confirmation is up. */
  confirming: boolean;
  onConfirmingChange: (confirming: boolean) => void;
}

const records = (count: number) =>
  `${formatCount(count)} job ${count === 1 ? "record" : "records"}`;

/** The only way to clear the job history; the jobs panel deliberately offers none. */
export function DeleteAllJobsButton({
  visible,
  disabled,
  confirming,
  onConfirmingChange,
}: DeleteAllJobsButtonProps) {
  const { deleting, deleteAll } = useDeleteAllJobs();
  const countQuery = useQuery({
    queryKey: jobKeys.total,
    queryFn: ({ signal }) => fetchJobs({ limit: 1, signal }),
    enabled: visible,
  });
  const counts = countQuery.data ?? null;

  const runDeleteAll = async () => {
    if (await deleteAll()) onConfirmingChange(false);
  };

  return (
    <>
      <Button
        size="xs"
        icon={iconTrash2}
        busy={deleting}
        disabled={disabled || !counts || counts.total === 0}
        onClick={() => onConfirmingChange(true)}
      >
        Delete all jobs
      </Button>

      {confirming && counts && (
        <ConfirmDialog
          title="Delete all job records?"
          description={`This permanently removes all ${records(counts.total)} from history.${
            counts.active_count > 0 ? " Running jobs will be cancelled first." : ""
          }`}
          confirmLabel={deleting ? "Deleting..." : "Delete all"}
          confirmVariant="danger"
          busy={deleting}
          onConfirm={() => void runDeleteAll()}
          onCancel={() => {
            if (!deleting) onConfirmingChange(false);
          }}
        />
      )}
    </>
  );
}
