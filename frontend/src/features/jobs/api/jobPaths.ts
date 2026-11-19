export type JobStartPaths = {
  paths?: string[];
};

/** Only `undefined` means the whole folder; an empty list is sent and refused. */
export function withJobPaths<T extends object>(body: T, paths?: string[]): T & JobStartPaths {
  if (paths === undefined) {
    return body;
  }
  return { ...body, paths };
}
