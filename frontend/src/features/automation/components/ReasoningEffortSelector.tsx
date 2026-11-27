import { useId } from "react";
import { SegmentedControl, type SegmentOption } from "@/shared/ui/SegmentedControl";
import type { ReasoningEffortChoice } from "@/features/automation/hooks/useReasoningEffort";
import type { ReasoningEffort } from "@/shared/types";

// What a level does depends on the loaded model's chat template, so none is described here.
const EFFORTS: ReadonlyArray<SegmentOption<ReasoningEffort>> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra high" },
  { value: "max", label: "Max" },
];

// Stands in for the levels of a model that has none, so the dialog keeps its shape.
const NO_EFFORT: ReadonlyArray<SegmentOption<"none">> = [
  { value: "none", label: "None", hint: "The loaded model has no effort levels, so none is sent." },
];

interface ReasoningEffortSelectorProps {
  effort: ReasoningEffortChoice;
  disabled?: boolean;
}

/** How hard the model reasons, for the vision-LLM job dialogs in reasoning mode. */
export function ReasoningEffortSelector({
  effort,
  disabled = false,
}: ReasoningEffortSelectorProps) {
  const { value, levels, loading, onChange } = effort;
  const labelId = useId();
  const options = levels ? EFFORTS.filter((option) => levels.includes(option.value)) : EFFORTS;

  return (
    <div className="field">
      <span id={labelId} className="field__label">
        Reasoning effort
      </span>
      {loading ? (
        <div
          className="reasoning-effort__loading skeleton-shimmer"
          role="status"
          aria-label="Loading the model's reasoning levels..."
        />
      ) : options.length > 0 ? (
        <SegmentedControl
          labelledBy={labelId}
          value={value}
          options={options}
          stretch
          disabled={disabled}
          onChange={onChange}
        />
      ) : (
        <SegmentedControl
          labelledBy={labelId}
          value={NO_EFFORT[0].value}
          options={NO_EFFORT}
          stretch
          disabled
          onChange={() => {}}
        />
      )}
    </div>
  );
}
