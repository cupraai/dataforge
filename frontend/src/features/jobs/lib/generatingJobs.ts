import type { JobType } from "@/shared/types";

/** Jobs that make new files and read none of the folder's. */
export const GENERATING_JOBS: ReadonlySet<JobType> = new Set<JobType>([
  "comfy_generate",
  "comfy_showcase",
]);
