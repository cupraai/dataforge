import { GuardedDialog } from "@/shared/ui/GuardedDialog";
import { jobTypeIconFor } from "@/features/jobs/lib/jobMeta";
import { InstructionFileSource } from "@/features/automation/components/InstructionFileSource";
import { instructionApplies } from "@/shared/api/folderInstructions";
import { CAPTION_RULES_FILENAME } from "@/shared/constants";
import { useFolderInstructions } from "@/shared/hooks/useFolderInstructions";
import { DialogActions } from "@/shared/ui/Dialog";
import type { DialogScopeInfo } from "@/shared/ui/DialogScope";

interface CheckCaptionRulesDialogProps {
  scope: DialogScopeInfo;
  folderPath: string;
  busy?: boolean;
  /** Replaces the start label, as when the dialog edits a workflow step instead. */
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function CheckCaptionRulesDialog({
  scope,
  folderPath,
  busy = false,
  confirmLabel,
  onConfirm,
  onCancel,
}: CheckCaptionRulesDialogProps) {
  const { state, instructions } = useFolderInstructions(folderPath);
  const rules = instructions?.caption_rules ?? null;
  const rulesApply = rules !== null && instructionApplies(rules);

  return (
    <GuardedDialog
      confirmDisabled={!rulesApply}
      scope={scope}
      icon={jobTypeIconFor("check_caption_rules")}
      title="Lint captions?"
      description={
        <>
          Checks each caption against the folder's caption rules. Hits show up as caption issues,
          next to any findings from Verify captions.
        </>
      }
      panelClassName="check-caption-rules-dialog"
      busy={busy}
      onConfirm={rulesApply ? onConfirm : undefined}
      onClose={onCancel}
      footer={
        <>
          <DialogActions
            confirmLabel={confirmLabel ?? "Lint captions"}
            busyLabel="Starting..."
            onCancel={onCancel}
          />
        </>
      }
    >
      <div className="dialog-facts">
        <InstructionFileSource state={state} kind="caption_rules" />
      </div>
      {state.status === "error" && (
        <p className="dialog__error" role="alert">
          Could not load the caption rules. {state.message}
        </p>
      )}

      {rules?.state.status === "missing" && (
        <p className="field__hint check-caption-rules-dialog__missing">
          No caption rules apply to this folder yet. Add them in Folder instructions first; they are
          saved as <strong>{CAPTION_RULES_FILENAME}</strong> and cover every subfolder too.
        </p>
      )}
    </GuardedDialog>
  );
}
