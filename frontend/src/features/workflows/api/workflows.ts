import { queryOptions } from "@tanstack/react-query";
import { postJson, putJson, requestJson } from "@/shared/api/http";
import type { Workflow, WorkflowRunResponse, WorkflowsResponse } from "@/shared/types";

export const WORKFLOWS_QUERY_KEY = ["workflows"] as const;

const URL = "/api/workflows";

export function workflowsQueryOptions() {
  return queryOptions({
    queryKey: WORKFLOWS_QUERY_KEY,
    queryFn: ({ signal }) => requestJson<WorkflowsResponse>(URL, { signal }),
  });
}

/** Saves `workflow`, replacing the one saved as `previousName` when it is renamed. */
export function saveWorkflow(
  workflow: Workflow,
  previousName?: string | null,
): Promise<WorkflowsResponse> {
  return putJson<WorkflowsResponse>(URL, { workflow, previous_name: previousName ?? null });
}

export function deleteWorkflow(name: string): Promise<WorkflowsResponse> {
  const params = new URLSearchParams({ name });
  return requestJson<WorkflowsResponse>(`${URL}?${params}`, { method: "DELETE" });
}

/** Queues every step on `paths`, or on the whole folder when `paths` is undefined. */
export function runWorkflow(
  folderPath: string,
  name: string,
  paths?: string[],
): Promise<WorkflowRunResponse> {
  const params = new URLSearchParams({ path: folderPath });
  return postJson<WorkflowRunResponse>(`${URL}/run?${params}`, { name, paths: paths ?? null });
}
