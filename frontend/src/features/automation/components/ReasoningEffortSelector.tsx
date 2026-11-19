import { RadioTileGroup, type RadioTileOption } from "@/shared/ui/RadioTileGroup";
import type { ReasoningEffort } from "@/shared/types";

export type { ReasoningEffort };

// Fixed by the chat template, which raises on anything else.
const EFFORTS: ReadonlyArray<RadioTileOption<ReasoningEffort>> = [
  {
    value: "xhigh",
    title: "Extra high",
    description: "Validates assumptions, weighs alternatives",
  },
  { value: "medium", title: "Medium", description: "Balanced; the right level for captioning" },
  { value: "low", title: "Low", description: "Brief thinking, straight to the answer" },
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
  return (
    <RadioTileGroup
      value={value}
      options={EFFORTS}
      label="Reasoning effort"
      disabled={disabled}
      onChange={onChange}
    />
  );
}
