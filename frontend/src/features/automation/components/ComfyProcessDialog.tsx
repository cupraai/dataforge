import { Checkbox } from "@/shared/ui/Checkbox";
import { GuardedDialog } from "@/shared/ui/GuardedDialog";
import { useId, useState } from "react";
import type { JobSettingsByType } from "@/features/automation/preferences/automationPreferences";
import {
  useComfyPresetForm,
  type ResolvedPresetValues,
} from "@/features/automation/hooks/useComfyPresetForm";
import { ComfyPresetFields } from "./ComfyPresetFields";
import { DialogActions } from "@/shared/ui/Dialog";
import type { DialogScopeInfo } from "@/shared/ui/DialogScope";

export interface ComfyProcessSettings extends ResolvedPresetValues {
  overwriteCandidates: boolean;
}

interface ComfyProcessDialogProps {
  scope: DialogScopeInfo;
  initialSettings: JobSettingsByType["comfy_process"];
  busy?: boolean;
  /** Replaces the start label, as when the dialog edits a workflow step instead. */
  confirmLabel?: string;
  onConfirm: (settings: ComfyProcessSettings) => void;
  onCancel: () => void;
}

export function ComfyProcessDialog({
  scope,
  initialSettings,
  busy = false,
  confirmLabel,
  onConfirm,
  onCancel,
}: ComfyProcessDialogProps) {
  const form = useComfyPresetForm(initialSettings, "edit");
  const [error, setError] = useState<string | null>(null);
  const [overwrite, setOverwrite] = useState(initialSettings.overwrite_candidates);
  const errorId = useId();
  const ready = form.state.status === "ready";

  const handleConfirm = () => {
    if (busy || !ready) return;

    const resolved = form.resolve();
    if ("error" in resolved) {
      setError(resolved.error);
      return;
    }

    setError(null);
    onConfirm({ ...resolved.values, overwriteCandidates: overwrite });
  };

  return (
    <GuardedDialog
      confirmDisabled={busy || !ready || !form.preset}
      unsavedChanges={form.changed || overwrite !== initialSettings.overwrite_candidates}
      scope={scope}
      title="Edit with ComfyUI?"
      description={
        <>
          Runs each image through the workflow and writes the result as a <strong>candidate</strong>{" "}
          in the <strong>staging</strong> subfolder, for you to accept or reject.
        </>
      }
      panelClassName="comfy-process-dialog"
      busy={busy}
      onConfirm={handleConfirm}
      onClose={onCancel}
      describedById={error ? errorId : undefined}
      footer={
        <>
          {/* In the footer, so a message never shifts the columns. */}
          {error && (
            <p id={errorId} className="dialog__error comfy-preset-layout__error" role="alert">
              {error}
            </p>
          )}
          <DialogActions
            confirmLabel={confirmLabel ?? "Start processing"}
            busyLabel="Starting..."
            onCancel={onCancel}
          />
        </>
      }
    >
      <ComfyPresetFields form={form} kind="edit" busy={busy} onEdited={() => setError(null)}>
        <Checkbox
          label={
            <>
              Replace candidates already waiting in <strong>staging</strong>
            </>
          }
          checked={overwrite}
          disabled={busy}
          onChange={setOverwrite}
        />
      </ComfyPresetFields>
    </GuardedDialog>
  );
}
