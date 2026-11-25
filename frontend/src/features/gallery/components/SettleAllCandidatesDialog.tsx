import { Checkbox } from "@/shared/ui/Checkbox";
import { GuardedDialog } from "@/shared/ui/GuardedDialog";
import type { SettleAllCandidatesAction } from "@/features/gallery/lib/settleAllCandidates";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { DialogActions } from "@/shared/ui/Dialog";
import type { DialogScopeInfo } from "@/shared/ui/DialogScope";
import { trashName } from "@/shared/lib/platform";

export interface SettleAllCandidatesDialogProps {
  action: SettleAllCandidatesAction | null;
  scope: DialogScopeInfo;
  busy: boolean;
  /** Accept only: give each file its original's metadata instead of ComfyUI's. */
  keepMetadata: boolean;
  onKeepMetadataChange: (keep: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SettleAllCandidatesDialog({
  action,
  scope,
  busy,
  keepMetadata,
  onKeepMetadataChange,
  onConfirm,
  onCancel,
}: SettleAllCandidatesDialogProps) {
  if (!action) return null;

  const confirm = () => {
    onConfirm();
  };

  if (action === "delete") {
    return (
      <ConfirmDialog
        title={
          scope.kind === "selected"
            ? "Delete selected candidates?"
            : "Delete all staged candidates?"
        }
        scope={scope}
        description={`Deletes each staged candidate and keeps the files they were made from. Candidates are moved to the ${trashName()}.`}
        confirmLabel={busy ? "Deleting..." : "Delete"}
        confirmVariant="danger"
        busy={busy}
        onConfirm={confirm}
        onCancel={onCancel}
      />
    );
  }

  return (
    <GuardedDialog
      role="alertdialog"
      title={
        scope.kind === "selected" ? "Accept selected candidates?" : "Accept all staged candidates?"
      }
      scope={scope}
      description="Replaces each file with its staged candidate, without comparing them first. An unreverted edit is discarded too, making the candidate the new original. No backup is kept, so this cannot be undone."
      busy={busy}
      onConfirm={confirm}
      onClose={onCancel}
      footer={<DialogActions confirmLabel={busy ? "Accepting..." : "Accept"} onCancel={onCancel} />}
    >
      <Checkbox
        label="Keep original metadata"
        checked={keepMetadata}
        disabled={busy}
        onChange={onKeepMetadataChange}
        hint="Each file keeps its original's EXIF, XMP and text metadata in place of what ComfyUI wrote. A file whose metadata cannot be carried over is left staged."
      />
    </GuardedDialog>
  );
}
