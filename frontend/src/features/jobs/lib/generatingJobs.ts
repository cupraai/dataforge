import type { JobType } from "@/shared/types";

/** Jobs that always make new files and read none of the folder's. */
export const GENERATING_JOBS: ReadonlySet<JobType> = new Set<JobType>(["comfy_showcase"]);

/** Jobs that can make new files, so even an empty folder can run them; a job's own `generates`
 * says whether a run did. */
export const MAY_GENERATE_JOBS: ReadonlySet<JobType> = new Set<JobType>([
  ...GENERATING_JOBS,
  "comfy_run",
]);
