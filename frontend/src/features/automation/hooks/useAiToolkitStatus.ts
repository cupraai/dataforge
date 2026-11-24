import { useQuery } from "@tanstack/react-query";
import type { ServiceState } from "@/features/automation/components/ServiceStatus";
import { SERVICE_POLL_MS } from "@/features/automation/lib/servicePoll";
import { externalJobsQueryOptions } from "@/features/jobs/lib/externalJobsQuery";

/** Whether AI-Toolkit answers, read again when a dialog opens and polled while it is; the
 * backend's answer is at most one of its own polls (two seconds) old. */
export function useAiToolkitStatus(): ServiceState {
  const query = useQuery({ ...externalJobsQueryOptions(), refetchInterval: SERVICE_POLL_MS });
  if (!query.isFetchedAfterMount) return "checking";
  return query.data?.available ? "ready" : "offline";
}
