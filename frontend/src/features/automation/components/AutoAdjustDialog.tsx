import { Checkbox } from "@/shared/ui/Checkbox";
import { jobTypeIconFor } from "@/features/jobs/lib/jobMeta";
import { GuardedDialog } from "@/shared/ui/GuardedDialog";
import { useCallback, useState } from "react";
import { DialogActions } from "@/shared/ui/Dialog";
import type { DialogScopeInfo } from "@/shared/ui/DialogScope";
import type { AutoAdjustRunSettings } from "@/shared/types";

interface AutoAdjustDialogProps {
  scope: DialogScopeInfo;
  /** Only a workflow step passes these; a run re-chooses them every time. */
  initialSettings?: AutoAdjustRunSettings;
  busy?: boolean;
  /** Replaces the start label, as when the dialog edits a workflow step instead. */
  confirmLabel?: string;
  onConfirm: (replaceAdjustments: boolean, resetAdjustments: boolean) => void;
  onCancel: () => void;
}

export function AutoAdjustDialog({
  scope,
  initialSettings,
  busy = false,
  confirmLabel,
  onConfirm,
  onCancel,
}: AutoAdjustDialogProps) {
  // Never remembered: discarding earlier adjustments is destructive, so it is re-chosen every run.
  const [replace, setReplace] = useState(initialSettings?.replace_adjustments ?? false);
  const [reset, setReset] = useState(initialSettings?.reset_adjustments ?? false);

  const handleConfirm = useCallback(() => {
    if (busy) return;
    onConfirm(!reset && replace, reset);
  }, [busy, onConfirm, replace, reset]);

  return (
    <GuardedDialog
      unsavedChanges={replace || reset}
      scope={scope}
      icon={jobTypeIconFor("auto_adjust")}
      title={reset ? "Reset color adjustments?" : "Auto-adjust media?"}
      description={
        reset ? (
          <>Resets color adjustments on each image and video. All other edits are kept.</>
        ) : (
          <>
            Applies the Adjust wand to each image and MP4. Crops, masks and trims are kept, and each
            original is stored so the editor can revert it.
          </>
        )
      }
      panelClassName="auto-adjust-dialog"
      busy={busy}
      onConfirm={handleConfirm}
      onClose={onCancel}
      footer={
        <DialogActions
          confirmLabel={confirmLabel ?? (reset ? "Reset color adjustments" : "Start auto-adjust")}
          busyLabel="Starting..."
          onCancel={onCancel}
        />
      }
    >
      <Checkbox
        label="Replace earlier adjustments"
        checked={replace}
        disabled={busy || reset}
        onChange={setReplace}
        hint="When ticked, every adjust tool goes back to zero first, discarding changes made by hand. When unticked, those changes stay and the wand's result is added on top."
      />
      <Checkbox
        label="Reset all color adjustments to zero"
        checked={reset}
        disabled={busy}
        onChange={setReset}
        hint="Clears manual and automatic color adjustments without applying the wand. Crops, masks and all other edits are kept."
      />
    </GuardedDialog>
  );
}
