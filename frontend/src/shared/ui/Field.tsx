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
    <label htmlFor={id} className="field__label">
      {label}
    </label>
  );

  return (
    <div className={classNames("field", className)}>
      {labelEnd ? (
        <div className="field__label-row">
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
          className={classNames("field__hint", Boolean(error) && "field__hint--error")}
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
    <fieldset role={role} className={classNames("field field--group", className)}>
      <legend className="field__label">{label}</legend>
      {children}
    </fieldset>
  );
}

interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  /** md in dialogs and settings; sm in tool bars and popovers; xs in the editor inspector. */
  size?: "md" | "sm" | "xs";
  /**
   * Inside the field's end, such as a unit or a small IconButton; `className` then sizes the box.
   * Pass null while it is empty, not undefined, or the input remounts when it appears.
   */
  end?: ReactNode;
  ref?: Ref<HTMLInputElement>;
}

export function TextInput({
  size = "md",
  type = "text",
  className,
  end,
  ...props
}: TextInputProps) {
  const classes = classNames("text-input", size !== "md" && `text-input--${size}`, className);
  if (end === undefined) {
    return <input {...props} type={type} className={classes} />;
  }
  return (
    <div className={classNames(classes, "text-input--adorned")}>
      <input {...props} type={type} className="text-input__field" />
      <span className="text-input__end">{end}</span>
    </div>
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
        "text-input text-input--multiline",
        grow && "text-input--grow",
        className,
      )}
    />
  );
}
