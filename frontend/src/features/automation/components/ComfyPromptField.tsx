import { useRef, type ReactNode } from "react";
import { SavedSnippetMenu } from "@/features/automation/components/SavedSnippetMenu";
import { appendSnippet } from "@/features/automation/lib/appendSnippet";
import { Field, TextArea } from "@/shared/ui/Field";

interface ComfyPromptFieldProps {
  value: string;
  /** The preset has no prompt node: the field stays, empty and off. */
  blocked: boolean;
  placeholder: string;
  /** The hint below that explains an empty field, where there is one. */
  hintId?: string;
  disabled: boolean;
  /** Before the saved prompts menu, for an option about the prompt. */
  labelEnd?: ReactNode;
  onChange: (text: string) => void;
}

/** The ComfyUI dialogs' prompt, which takes the form's spare height. */
export function ComfyPromptField({
  value,
  blocked,
  placeholder,
  hintId,
  disabled,
  labelEnd,
  onChange,
}: ComfyPromptFieldProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const shown = blocked ? "" : value;
  return (
    <Field
      label="Prompt"
      labelEnd={
        <>
          {labelEnd}
          <SavedSnippetMenu
            book="comfy_prompts"
            text={shown}
            disabled={disabled || blocked}
            onInsert={(text) => {
              onChange(appendSnippet(value, text));
              inputRef.current?.focus();
            }}
          />
        </>
      }
      className="comfy-preset-layout__prompt"
    >
      {(control) => (
        <TextArea
          {...control}
          ref={inputRef}
          aria-describedby={hintId}
          rows={4}
          value={shown}
          placeholder={blocked ? "This preset has no prompt node" : placeholder}
          disabled={disabled || blocked}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}
