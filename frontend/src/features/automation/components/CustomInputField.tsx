import type { ComfyPresetInput } from "@/shared/types";
import { DialogSelect } from "@/shared/ui/DialogSelect";
import { Field, TextInput } from "@/shared/ui/Field";

type BooleanChoice = "" | "on" | "off";

interface CustomInputFieldProps {
  input: ComfyPresetInput;
  text: string;
  disabled: boolean;
  onChange: (text: string) => void;
}

/** One `DataForge <name>` node; the saved value is the placeholder an empty field runs with. */
export function CustomInputField({ input, text, disabled, onChange }: CustomInputFieldProps) {
  if (input.kind === "boolean") {
    return (
      <DialogSelect<BooleanChoice>
        label={input.name}
        value={text === "on" || text === "off" ? text : ""}
        options={[
          { value: "", title: `Default (${input.default ? "on" : "off"})` },
          { value: "on", title: "On" },
          { value: "off", title: "Off" },
        ]}
        disabled={disabled}
        onChange={onChange}
      />
    );
  }

  const numeric = input.kind !== "text";
  return (
    <Field label={input.name} className={numeric ? undefined : "comfy-preset-fields__cell--wide"}>
      {(control) => (
        <TextInput
          {...control}
          type={numeric ? "number" : "text"}
          step={input.kind === "integer" ? 1 : numeric ? "any" : undefined}
          value={text}
          onChange={(event) => onChange(event.target.value)}
          placeholder={String(input.default)}
          spellCheck={false}
          autoComplete="off"
          disabled={disabled}
        />
      )}
    </Field>
  );
}
