import { RadioTileGroup, type RadioTileOption } from "@/shared/ui/RadioTileGroup";
import type { AutomationMode } from "@/shared/types";

const MODES: ReadonlyArray<RadioTileOption<AutomationMode>> = [
  { value: "thinking", title: "Reasoning", description: "Slower, but better overall outcome" },
  { value: "instruct", title: "Instruct", description: "Faster, but makes more mistakes" },
];

interface AutomationModeSelectorProps {
  value: AutomationMode;
  disabled?: boolean;
  onChange: (mode: AutomationMode) => void;
}

/** Reasoning / Instruct tiles shared by the vision-LLM job dialogs. */
export function AutomationModeSelector({
  value,
  disabled = false,
  onChange,
}: AutomationModeSelectorProps) {
  return (
    <RadioTileGroup
      value={value}
      options={MODES}
      label="Mode"
      disabled={disabled}
      onChange={onChange}
    />
  );
}
