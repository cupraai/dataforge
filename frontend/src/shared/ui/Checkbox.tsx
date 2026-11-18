import { useId, type ReactNode } from "react";
import { classNames } from "@/shared/lib/classNames";

interface CheckboxProps {
  label: ReactNode;
  /** Rendered under the label and announced as its description. */
  hint?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  /** Layout classes for the wrapper, which is a field and spaces itself like one. */
  className?: string;
}

export function Checkbox({
  label,
  hint,
  checked,
  disabled = false,
  onChange,
  className,
}: CheckboxProps) {
  const id = useId();
  const hintId = `${id}-hint`;

  return (
    <div className={classNames("field field--check", className)}>
      <label className="checkbox" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          className="checkbox__input"
          checked={checked}
          disabled={disabled}
          aria-describedby={hint ? hintId : undefined}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="checkbox__box" aria-hidden="true" />
        <span className="checkbox__label">{label}</span>
      </label>
      {hint && (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      )}
    </div>
  );
}
