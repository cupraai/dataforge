import { useState } from "react";
import { useVisionLlmInfo } from "@/features/automation/hooks/useVisionLlmInfo";
import { nearestEffort } from "@/features/automation/lib/reasoningEffort";
import type { ReasoningEffort } from "@/shared/types";

export interface ReasoningEffortChoice {
  /** The level to show and submit: the chosen one, moved to the nearest the model supports. */
  value: ReasoningEffort;
  /** The served model's levels; null when unknown, which offers every level. */
  levels: readonly ReasoningEffort[] | null;
  /** The server has not answered yet, so the levels are not known either way. */
  loading: boolean;
  changed: boolean;
  onChange: (effort: ReasoningEffort) => void;
}

/** A job dialog's effort, limited to what the loaded model's chat template accepts. */
export function useReasoningEffort(initial: ReasoningEffort): ReasoningEffortChoice {
  const [chosen, setChosen] = useState(initial);
  const { info, ready } = useVisionLlmInfo();
  const levels = info?.reasoningEfforts ?? null;
  const value = nearestEffort(chosen, levels);
  return {
    value,
    levels,
    loading: !ready,
    // Moving a remembered level the model lacks is not an edit to guard on close.
    changed: value !== nearestEffort(initial, levels),
    onChange: setChosen,
  };
}
