import { useQuery } from "@tanstack/react-query";
import {
  VISION_MODEL_QUERY_KEY,
  fetchVisionLlmInfo,
  type VisionLlmInfo,
} from "@/features/automation/api/visionLlm";
import { SERVICE_POLL_MS } from "@/features/automation/lib/servicePoll";
import { formatApiError } from "@/shared/api/http";
import type { ServiceState } from "@/features/automation/components/ServiceStatus";

export interface VisionLlmState {
  /** False until an answer is in: the dialogs wait instead of showing guesses that change. */
  ready: boolean;
  /** Null when the backend could not be asked, which offers every level. */
  info: VisionLlmInfo | null;
  /** The server did not answer, so no job can start. */
  unreachable: boolean;
  /** What the dialogs' status indicator shows. */
  service: ServiceState;
  /** What is wrong and how to fix it, when the server answers but its model is unknown. */
  issue: string | null;
}

/** Kept between dialogs until Settings are saved, polled while one is open; an unanswered ask
 * is repeated on each open. */
export function useVisionLlmInfo(): VisionLlmState {
  const { data, error, isPending, isFetchedAfterMount } = useQuery({
    queryKey: VISION_MODEL_QUERY_KEY,
    queryFn: fetchVisionLlmInfo,
    staleTime: (query) => (query.state.data?.reachable === false ? 0 : Infinity),
    retry: false,
    refetchInterval: SERVICE_POLL_MS,
    // The poll already covers a return to the window.
    refetchOnWindowFocus: false,
  });
  const unreachable = data?.reachable === false;
  // Asking again on opening after no answer waits too, rather than showing the old failure;
  // the polls after that stay silent.
  const ready = !isPending && !(unreachable && !isFetchedAfterMount);
  if (!ready) return { ready, info: null, unreachable: false, service: "checking", issue: null };
  if (!data) {
    // DataForge itself did not answer, so nothing is known about the vision server either way.
    return {
      ready,
      info: null,
      unreachable: false,
      service: "warning",
      issue: `Could not check the vision server, so every reasoning level is offered. ${formatApiError(error)}`,
    };
  }
  if (unreachable) return { ready, info: data, unreachable, service: "offline", issue: null };
  return {
    ready,
    info: data,
    unreachable,
    service: data.detail ? "warning" : "ready",
    issue: data.detail
      ? `${data.detail}, so every reasoning level is offered. Check the vision server in Settings.`
      : null,
  };
}
