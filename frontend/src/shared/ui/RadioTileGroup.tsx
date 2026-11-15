import { useId } from "react";
import { classNames } from "@/shared/lib/classNames";
import { FieldGroup } from "./Field";

export interface RadioTileOption<T extends string> {
  value: T;
  title: string;
  /** Omit for tiles whose title says everything, e.g. an opacity percentage. */
  description?: string;
}

interface RadioTileGroupProps<T extends string> {
  value: T;
  options: ReadonlyArray<RadioTileOption<T>>;
  /** Field label above the tiles, which also names the group. */
  label: string;
  disabled?: boolean;
  onChange: (value: T) => void;
}

/** A row of selectable tiles backed by native radios. */
export function RadioTileGroup<T extends string>({
  value,
  options,
  label,
  disabled = false,
  onChange,
}: RadioTileGroupProps<T>) {
  const name = useId();

  return (
    <FieldGroup label={label} role="radiogroup">
      <div className="dialog__options">
        {options.map((option) => {
          const inputId = `${name}-${option.value}`;

          return (
            <label
              key={option.value}
              className={classNames(
                "dialog__option",
                value === option.value && "dialog__option--selected",
              )}
              htmlFor={inputId}
            >
              <input
                id={inputId}
                type="radio"
                name={name}
                className="dialog__radio-input"
                value={option.value}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
                disabled={disabled}
              />
              <span className="dialog__radio" aria-hidden="true" />
              <div className="dialog__option-content">
                <span className="dialog__option-title">{option.title}</span>
                {option.description && (
                  <span className="dialog__option-desc">{option.description}</span>
                )}
              </div>
            </label>
          );
        })}
      </div>
    </FieldGroup>
  );
}
