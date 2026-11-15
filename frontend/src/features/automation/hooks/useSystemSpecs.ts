import { useQuery } from "@tanstack/react-query";
import { systemSpecsQueryOptions } from "@/features/automation/lib/automationQueries";
import type { SystemSpecs } from "@/shared/types";

/** Each poll also shells out to nvidia-smi, which takes tens of milliseconds. */
export const REFRESH_INTERVAL_MS = 1_000;

/** Polls every second while `open`; a closed panel reads nothing. */
export function useSystemSpecs(open: boolean): SystemSpecs | null {
  // Cached across panel remounts, and a failed poll keeps the last known specs.
  const { data } = useQuery({
    ...systemSpecsQueryOptions(),
    enabled: open,
    // The polling cadence owns freshness; remounts and focus need no extra reads.
    staleTime: REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: false,
    refetchInterval: open ? REFRESH_INTERVAL_MS : false,
    refetchIntervalInBackground: true,
  });

  return data ?? null;
}
