import type { ReactNode } from "react";
import { Field } from "./Field";
import { Select } from "./Select";

export interface DialogSelectOption<T extends string> {
  value: T;
  title: string;
  /** Adjacent options naming the same group render under one `<optgroup>`. */
  group?: string;
}

interface OptionRun<T extends string> {
  group: string | undefined;
  options: DialogSelectOption<T>[];
}

function groupAdjacent<T extends string>(
  options: ReadonlyArray<DialogSelectOption<T>>,
): OptionRun<T>[] {
  const runs: OptionRun<T>[] = [];
  for (const option of options) {
    const last = runs.at(-1);
    if (last && option.group && last.group === option.group) {
      last.options.push(option);
    } else {
      runs.push({ group: option.group, options: [option] });
    }
  }
  return runs;
}

function renderOptions<T extends string>(options: ReadonlyArray<DialogSelectOption<T>>) {
  return options.map((option) => (
    <option key={option.value} value={option.value}>
      {option.title}
    </option>
  ));
}

interface DialogSelectProps<T extends string> {
  /** Field label above the control. */
  label: string;
  value: T;
  options: ReadonlyArray<DialogSelectOption<T>>;
  /** Under the control, and read out as its description. */
  hint?: ReactNode;
  disabled?: boolean;
  onChange: (value: T) => void;
}

/** A labelled native select in the dialog form styling. */
export function DialogSelect<T extends string>({
  label,
  value,
  options,
  hint,
  disabled = false,
  onChange,
}: DialogSelectProps<T>) {
  return (
    <Field label={label} hint={hint}>
      {(control) => (
        <Select
          {...control}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value as T)}
        >
          {groupAdjacent(options).map((run) =>
            run.group ? (
              <optgroup key={`${run.group}:${run.options[0].value}`} label={run.group}>
                {renderOptions(run.options)}
              </optgroup>
            ) : (
              renderOptions(run.options)
            ),
          )}
        </Select>
      )}
    </Field>
  );
}
