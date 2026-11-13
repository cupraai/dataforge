import { Field, TextInput } from "@/shared/ui/Field";
import { GuardedDialog } from "@/shared/ui/GuardedDialog";
import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { DialogActions } from "@/shared/ui/Dialog";

interface RenameDialogProps {
  title: string;
  description: ReactNode;
  fieldLabel: string;
  /** What the field starts with: a folder's name, or a file's name before its extension. */
  initialName: string;
  busy?: boolean;
  suspended?: boolean;
  error?: string | null;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

export function RenameDialog({
  title,
  description,
  fieldLabel,
  initialName,
  busy = false,
  suspended = false,
  error = null,
  onConfirm,
  onCancel,
}: RenameDialogProps) {
  const [name, setName] = useState(initialName);
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && trimmedName !== initialName;

  const handleConfirm = useCallback(() => {
    if (busy || !canSubmit) return;
    onConfirm(trimmedName);
  }, [busy, canSubmit, onConfirm, trimmedName]);

  return (
    <GuardedDialog
      confirmDisabled={!canSubmit}
      unsavedChanges={name !== initialName}
      title={title}
      description={description}
      panelClassName="rename-dialog"
      busy={busy}
      suspended={suspended}
      onConfirm={handleConfirm}
      onClose={onCancel}
      initialFocusRef={inputRef}
      describedById={error ? errorId : undefined}
      footer={<DialogActions confirmLabel="Rename" busyLabel="Renaming..." onCancel={onCancel} />}
    >
      <Field label={fieldLabel}>
        {(control) => (
          <TextInput
            {...control}
            ref={inputRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            disabled={busy}
            autoComplete="off"
            spellCheck={false}
          />
        )}
      </Field>

      {error && (
        <p id={errorId} className="dialog__error" role="alert">
          {error}
        </p>
      )}
    </GuardedDialog>
  );
}
