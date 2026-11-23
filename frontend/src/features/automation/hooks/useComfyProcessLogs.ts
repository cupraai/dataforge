import { useQuery } from "@tanstack/react-query";
import { fetchComfyLogs } from "@/features/automation/api/jobs";
import { isActiveJobStatus } from "@/features/jobs/lib/jobs";
import type { ComfyLogsResponse, Job } from "@/shared/types";

/** The fastest poll in the app: the only sign of life during a long render. */
export const COMFY_LOG_POLL_MS = 1000;

/** ComfyUI's console during a run, or null; keyed by job so stale output never shows. */
export function useComfyProcessLogs(job: Job | null): ComfyLogsResponse | null {
  const jobId = job?.id ?? "";
  const enabled = job !== null && job.job_type === "comfy_run" && isActiveJobStatus(job.status);

  // A tick never overlaps a request still out, so a ComfyUI busy sampling is not queued at.
  const { data } = useQuery({
    queryKey: ["comfy-logs", jobId],
    queryFn: ({ signal }) => fetchComfyLogs(signal),
    enabled,
    refetchInterval: COMFY_LOG_POLL_MS,
    refetchIntervalInBackground: true,
    // One dropped poll keeps the last output rather than blanking the log mid-run.
    retry: false,
  });

  return (enabled && data) || null;
}
