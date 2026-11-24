import { queryOptions } from "@tanstack/react-query";
import { fetchOstrisJobs } from "@/features/jobs/api/externalJobs";
import { jobKeys } from "@/features/jobs/lib/jobQueries";
import { newerExternalJobs } from "@/features/jobs/lib/jobsCache";
import { mergedRead } from "@/shared/query/queryClient";
import type { ExternalOstrisJobsResponse } from "@/shared/types";

export const NO_EXTERNAL_JOBS: ExternalOstrisJobsResponse = {
  jobs: [],
  active_count: 0,
  available: false,
  revision: 0,
};

const readExternalJobs = mergedRead(
  // A missing AI-Toolkit is an expected state, not an error to retry.
  (signal) => fetchOstrisJobs(signal).catch(() => NO_EXTERNAL_JOBS),
  newerExternalJobs,
);

/** AI-Toolkit's jobs and whether it answers: polled by the jobs drawer, re-read by a dialog. */
export function externalJobsQueryOptions() {
  return queryOptions({
    queryKey: jobKeys.external,
    queryFn: readExternalJobs,
    meta: { pushFed: true },
  });
}
