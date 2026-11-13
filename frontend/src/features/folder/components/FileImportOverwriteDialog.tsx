import { Button } from "@/shared/ui/Button";
import { GuardedDialog } from "@/shared/ui/GuardedDialog";
import { iconAlertTriangle } from "@/shared/icons";

type FileImportOverwriteDialogProps = {
  conflicts: string[];
  busy?: boolean;
  title?: string;
  descriptionSuffix?: string;
  skipLabel?: string;
  onReplaceExisting: () => void;
  onCopyNewOnly: () => void;
  onCancel: () => void;
};

export function FileImportOverwriteDialog({
  conflicts,
  busy = false,
  title = "Replace existing files?",
  descriptionSuffix = "Choose whether to replace them or import only new files.",
  skipLabel = "Skip existing",
  onReplaceExisting,
  onCopyNewOnly,
  onCancel,
}: FileImportOverwriteDialogProps) {
  const conflictPreview =
    conflicts.length <= 3
      ? conflicts.join(", ")
      : `${conflicts.slice(0, 3).join(", ")} and ${conflicts.length - 3} more`;

  return (
    <GuardedDialog
      role="alertdialog"
      title={title}
      description={
        <>
          {conflicts.length === 1 ? (
            <>
              <strong>{conflictPreview}</strong> already exists in this folder.
            </>
          ) : (
            <>
              <strong>{conflicts.length} files</strong> already exist in this folder, including{" "}
              <strong>{conflictPreview}</strong>.
            </>
          )}
          <br />
          {descriptionSuffix}
        </>
      }
      busy={busy}
      onClose={onCancel}
      footer={
        <>
          <Button
            variant="warning"
            icon={iconAlertTriangle}
            disabled={busy}
            onClick={onReplaceExisting}
          >
            Replace existing
          </Button>
          <Button variant="primary" disabled={busy} onClick={onCopyNewOnly}>
            {skipLabel}
          </Button>
        </>
      }
    />
  );
}
