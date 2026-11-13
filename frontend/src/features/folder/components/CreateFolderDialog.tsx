import { Field, TextInput } from "@/shared/ui/Field";
import { GuardedDialog } from "@/shared/ui/GuardedDialog";
import { useCallback, useId, useRef, useState } from "react";
import { DialogActions } from "@/shared/ui/Dialog";

interface CreateFolderDialogProps {
  parentLabel: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

export function CreateFolderDialog({
  parentLabel,
  busy = false,
  error = null,
  onConfirm,
  onCancel,
}: CreateFolderDialogProps) {
  const [name, setName] = useState("");
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0;

  const handleConfirm = useCallback(() => {
    if (busy || !canSubmit) return;
    onConfirm(trimmedName);
  }, [busy, canSubmit, onConfirm, trimmedName]);

  return (
    <GuardedDialog
      confirmDisabled={!canSubmit}
      unsavedChanges={name !== ""}
      title="New folder"
      description={
        <>
          Create a subfolder in <strong>{parentLabel}</strong>.
        </>
      }
      panelClassName="create-folder-dialog"
      busy={busy}
      onConfirm={handleConfirm}
      onClose={onCancel}
      initialFocusRef={inputRef}
      describedById={error ? errorId : undefined}
      footer={
        <DialogActions confirmLabel="Create folder" busyLabel="Creating..." onCancel={onCancel} />
      }
    >
      <Field label="Folder name">
        {(control) => (
          <TextInput
            {...control}
            ref={inputRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Landscapes"
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
