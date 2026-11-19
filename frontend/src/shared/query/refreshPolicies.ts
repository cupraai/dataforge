/** Preferences are re-read on a stale mount, rather than on every reader or window focus. */
const PREFERENCE_STALE_MS = 60_000;

/** A preference mirrored in local storage paints at once; the server copy is read right after. */
export function mirroredPreference<T>(readMirror: () => T) {
  return {
    initialData: readMirror,
    initialDataUpdatedAt: 0,
    staleTime: PREFERENCE_STALE_MS,
    refetchOnWindowFocus: false,
  } as const;
}
