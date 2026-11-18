import { Field, TextArea } from "@/shared/ui/Field";
import { Checkbox } from "@/shared/ui/Checkbox";
import { GuardedDialog } from "@/shared/ui/GuardedDialog";
import { useCallback, useRef, useState } from "react";
import { DialogActions } from "@/shared/ui/Dialog";
import type { DialogScopeInfo } from "@/shared/ui/DialogScope";
import type { SetCaptionsRunSettings } from "@/shared/types";
import type { JobSettingsByType } from "@/features/automation/preferences/automationPreferences";

interface SetCaptionsDialogProps {
  scope: DialogScopeInfo;
  /** A workflow step's settings also carry the start-only choices, which then win. */
  initialSettings: JobSettingsByType["set_captions"] &
    Partial<Pick<SetCaptionsRunSettings, "overwrite">>;
  busy?: boolean;
  /** Replaces the start label, as when the dialog edits a workflow step instead. */
  confirmLabel?: string;
  onConfirm: (caption: string, overwrite: boolean) => void;
  onCancel: () => void;
}

export function SetCaptionsDialog({
  scope,
  initialSettings,
  busy = false,
  confirmLabel,
  onConfirm,
  onCancel,
}: SetCaptionsDialogProps) {
  const [caption, setCaption] = useState(initialSettings.caption);
  // Never restored: overwriting existing captions is destructive, so it is re-chosen
  // every run however the last one was started.
  const [overwrite, setOverwrite] = useState(initialSettings.overwrite ?? false);
  const captionRef = useRef<HTMLTextAreaElement>(null);

  const handleConfirm = useCallback(() => {
    if (busy) return;
    onConfirm(caption, overwrite);
  }, [busy, caption, onConfirm, overwrite]);

  return (
    <GuardedDialog
      unsavedChanges={caption !== initialSettings.caption || overwrite}
      scope={scope}
      title="Set captions?"
      description={
        <>
          Writes the provided caption text to each image and video as .txt sidecars. Undo on the
          job's notification puts back the previous captions, except ones edited since.
        </>
      }
      panelClassName="set-captions-dialog"
      busy={busy}
      onConfirm={handleConfirm}
      onClose={onCancel}
      initialFocusRef={captionRef}
      footer={
        <DialogActions
          confirmLabel={confirmLabel ?? "Set captions"}
          busyLabel="Starting..."
          onCancel={onCancel}
        />
      }
    >
      <Field label="Caption text">
        {(control) => (
          <TextArea
            {...control}
            ref={captionRef}
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            placeholder="e.g. a scenic mountain landscape at sunset"
            rows={3}
            disabled={busy}
          />
        )}
      </Field>

      <Checkbox
        label="Overwrite existing captions"
        checked={overwrite}
        disabled={busy}
        onChange={setOverwrite}
      />
    </GuardedDialog>
  );
}
