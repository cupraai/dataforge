import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteAllJobs } from "@/features/jobs/api/jobs";
import { jobKeys, removeOptimistically } from "@/features/jobs/lib/jobQueries";
import type { LiveJobs } from "@/features/jobs/lib/jobsCache";
import { formatApiError } from "@/shared/api/http";
import { formatCount } from "@/shared/lib/format";
import { useNotify } from "@/shared/notifications/notifications";

/** Deletes every job record, cancelling running jobs first; resolves whether it worked. */
export function useDeleteAllJobs() {
  const queryClient = useQueryClient();
  const notify = useNotify();

  const removeAll = useMutation({
    mutationFn: deleteAllJobs,
    onMutate: () => {
      const live = queryClient.getQueryData<LiveJobs>(jobKeys.live);
      return removeOptimistically(
        queryClient,
        (live?.jobs ?? []).map((job) => job.id),
      );
    },
    onSuccess: ({ deleted_count: count }) => {
      notify({
        variant: "success",
        message: `Deleted ${formatCount(count)} job ${count === 1 ? "record" : "records"}.`,
      });
    },
    onError: (error, _variables, context) => {
      queryClient.setQueryData(jobKeys.live, context?.previous);
      notify({ variant: "danger", message: `Could not delete jobs: ${formatApiError(error)}` });
    },
    onSettled: () =>
      Promise.all(
        [jobKeys.live, jobKeys.history, jobKeys.total].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  });

  const { mutateAsync, isPending } = removeAll;
  const deleteAll = useCallback(
    () =>
      mutateAsync().then(
        () => true,
        () => false,
      ),
    [mutateAsync],
  );

  return { deleting: isPending, deleteAll };
}
