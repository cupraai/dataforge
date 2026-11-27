import type { QueryClient } from "@tanstack/react-query";
import { folderKey } from "@/features/folder/lib/folderPath";
import type { JobsQuery } from "@/features/jobs/lib/jobFilters";
import { PENDING_REMOVAL_REVISION, removeJobs, type LiveJobs } from "@/features/jobs/lib/jobsCache";

export const jobKeys = {
  live: ["jobs", "live"] as const,
  external: ["jobs", "external"] as const,
  history: ["jobs", "history"] as const,
  /** Every stored job, unfiltered: what Settings' Delete all jobs counts in its confirmation. */
  total: ["jobs", "total"] as const,
  historyPage: (query: JobsQuery) => ["jobs", "history", query] as const,
  folderLatest: (folderPath: string) => ["jobs", "folder-latest", folderKey(folderPath)] as const,
  results: (jobId: string, finishedAt: string | null | undefined) =>
    ["jobs", "results", jobId, finishedAt ?? null] as const,
  samples: (trainingName: string) => ["jobs", "samples", trainingName] as const,
  finishedSamples: (jobId: string, step: number) =>
    ["jobs", "finished-samples", jobId, step] as const,
};

/** Drops jobs from the live list before the server confirms; the snapshot undoes it. */
export async function removeOptimistically(queryClient: QueryClient, ids: readonly string[]) {
  await queryClient.cancelQueries({ queryKey: jobKeys.live });
  const previous = queryClient.getQueryData<LiveJobs>(jobKeys.live);
  queryClient.setQueryData<LiveJobs>(jobKeys.live, (live) =>
    removeJobs(live, ids, PENDING_REMOVAL_REVISION),
  );
  return { previous };
}
