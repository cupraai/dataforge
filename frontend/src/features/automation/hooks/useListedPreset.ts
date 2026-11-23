import { useState } from "react";

interface ListedPreset {
  /** The preset to run, or empty when there is none to run. */
  preset: string;
  /** What was settled on, even once it has left the list; its drafts stay under this name. */
  target: string;
  /** Set when the settled preset has left the list, so nothing else runs in its place. */
  removed: string | null;
}

/**
 * Which preset a dialog shows while its list changes underneath. `wanted` settles on itself, or on
 * the first preset when the first list lacks it, and then stays: a preset added above never takes
 * over, and one that is removed leaves nothing selected until it returns or another is picked.
 * `names` is undefined until the list has loaded.
 */
export function useListedPreset(
  names: readonly string[] | undefined,
  wanted: string,
): ListedPreset {
  const [settled, setSettled] = useState<{ wanted: string; target: string } | null>(null);

  let current = settled?.wanted === wanted ? settled : null;
  if (current === null && names !== undefined && names.length > 0) {
    current = { wanted, target: names.includes(wanted) ? wanted : names[0] };
    setSettled(current);
  }

  if (names === undefined) return { preset: wanted, target: wanted, removed: null };
  if (current === null) return { preset: "", target: wanted, removed: null };
  const listed = names.includes(current.target);
  return {
    preset: listed ? current.target : "",
    target: current.target,
    removed: listed ? null : current.target,
  };
}
