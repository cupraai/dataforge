import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type TextareaHTMLAttributes,
} from "react";
import { classNames } from "@/shared/lib/classNames";

/** What a field hands its control: the id its label points at, and its description. */
export interface FieldControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

interface FieldProps {
  label: ReactNode;
  /** Beside the label, such as a menu that inserts into the control. */
  labelEnd?: ReactNode;
  /** Under the control, and read out as its description. */
  hint?: ReactNode;
  /** Replaces the hint while the value is refused, and marks the control invalid. */
  error?: ReactNode;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
}

/** A labelled form control in the app's field rhythm. */
export function Field({ label, labelEnd, hint, error, className, children }: FieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? hint;
  const labelElement = (
    <label htmlFor={id} className="dialog__label">
      {label}
    </label>
  );

  return (
    <div className={classNames("dialog__field", className)}>
      {labelEnd ? (
        <div className="dialog__label-row">
          {labelElement}
          {labelEnd}
        </div>
      ) : (
        labelElement
      )}
      {children({
        id,
        "aria-describedby": note ? noteId : undefined,
        "aria-invalid": error ? true : undefined,
      })}
      {note && (
        <p
          id={noteId}
          className={classNames("dialog__hint", Boolean(error) && "dialog__hint--error")}
          role={error ? "alert" : undefined}
        >
          {note}
        </p>
      )}
    </div>
  );
}

/** A labelled set of controls, such as radio tiles or a list of checkboxes. */
export function FieldGroup({
  label,
  role,
  className,
  children,
}: {
  label: ReactNode;
  /** Radios that make one choice; the legend names the group either way. */
  role?: "radiogroup";
  className?: string;
  children: ReactNode;
}) {
  return (
    <fieldset role={role} className={classNames("dialog__field dialog__fieldset", className)}>
      <legend className="dialog__label">{label}</legend>
      {children}
    </fieldset>
  );
}

interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  /** md in dialogs and settings; sm in tool bars and popovers; xs in the editor inspector. */
  size?: "md" | "sm" | "xs";
  ref?: Ref<HTMLInputElement>;
}

export function TextInput({ size = "md", type = "text", className, ...props }: TextInputProps) {
  return (
    <input
      {...props}
      type={type}
      className={classNames("dialog__input", size !== "md" && `dialog__input--${size}`, className)}
    />
  );
}

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Grows with its text instead of offering a resize handle. */
  grow?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
}

export function TextArea({ grow = false, className, ...props }: TextAreaProps) {
  return (
    <textarea
      {...props}
      className={classNames(
        "dialog__input dialog__input--multiline",
        grow && "dialog__input--grow",
        className,
      )}
    />
  );
}
