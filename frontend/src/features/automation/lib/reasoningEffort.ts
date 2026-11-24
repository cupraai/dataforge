import type { ReasoningEffort } from "@/shared/types";

/** Weakest first, as the backend ranks them in `chat_template.REASONING_EFFORTS`. */
const REASONING_EFFORTS: readonly ReasoningEffort[] = ["low", "medium", "high", "xhigh", "max"];

/**
 * The supported level closest in rank to `effort`, ties going to the stronger one; what a job
 * sends instead, so the dialog shows it too. Without choices the level is kept as remembered.
 */
export function nearestEffort(
  effort: ReasoningEffort,
  supported: readonly ReasoningEffort[] | null,
): ReasoningEffort {
  if (!supported || supported.length === 0 || supported.includes(effort)) return effort;
  const rank = REASONING_EFFORTS.indexOf(effort);
  const distance = (level: ReasoningEffort) => Math.abs(REASONING_EFFORTS.indexOf(level) - rank);
  return supported.reduce((best, level) =>
    distance(level) < distance(best) ||
    (distance(level) === distance(best) &&
      REASONING_EFFORTS.indexOf(level) > REASONING_EFFORTS.indexOf(best))
      ? level
      : best,
  );
}
