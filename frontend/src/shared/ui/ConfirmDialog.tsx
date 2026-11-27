import { GuardedDialog } from "@/shared/ui/GuardedDialog";
import type { ReactNode } from "react";
import { DialogActions } from "./Dialog";
import type { DialogScopeInfo } from "./DialogScope";
import type { AppIcon } from "@/shared/icons";

interface ConfirmDialogProps {
  title: string;
  icon?: AppIcon;
  /** What the confirmed action will run on; see `Dialog`. */
  scope?: DialogScopeInfo;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  confirmVariant?: "primary" | "warning" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  icon,
  scope,
  description,
  confirmLabel,
  cancelLabel,
  confirmVariant = "primary",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <GuardedDialog
      role="alertdialog"
      title={title}
      icon={icon}
      scope={scope}
      description={description}
      busy={busy}
      onConfirm={onConfirm}
      onClose={onCancel}
      footer={
        <DialogActions
          confirmLabel={confirmLabel}
          cancelLabel={cancelLabel}
          confirmVariant={confirmVariant}
          onCancel={onCancel}
        />
      }
    />
  );
}
