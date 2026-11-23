import { useId } from "react";
import { SegmentedControl, type SegmentOption } from "@/shared/ui/SegmentedControl";
import type { ReasoningEffort } from "@/shared/types";

export type { ReasoningEffort };

// Each chat template accepts only its own subset and raises on the rest, so no level is described
// here: what a level does depends on the loaded model.
const EFFORTS: ReadonlyArray<SegmentOption<ReasoningEffort>> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra high" },
  { value: "max", label: "Max" },
];

interface ReasoningEffortSelectorProps {
  value: ReasoningEffort;
  disabled?: boolean;
  onChange: (effort: ReasoningEffort) => void;
}

/** How hard the model reasons, for the vision-LLM job dialogs in reasoning mode. */
export function ReasoningEffortSelector({
  value,
  disabled = false,
  onChange,
}: ReasoningEffortSelectorProps) {
  const labelId = useId();

  return (
    <div className="field">
      <span id={labelId} className="field__label">
        Reasoning effort
      </span>
      <SegmentedControl
        labelledBy={labelId}
        value={value}
        options={EFFORTS}
        stretch
        disabled={disabled}
        onChange={onChange}
      />
    </div>
  );
}
