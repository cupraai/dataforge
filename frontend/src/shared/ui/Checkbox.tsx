import { useId, type ReactNode } from "react";

interface CheckboxProps {
  label: ReactNode;
  /** Rendered under the label and announced as its description. */
  hint?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  /** Classes for the wrapper; dialog forms pass `dialog__field` for the field rhythm. */
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
    <div className={className}>
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
        <p id={hintId} className="dialog__hint">
          {hint}
        </p>
      )}
    </div>
  );
}
