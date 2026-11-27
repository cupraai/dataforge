import { useContext, useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { iconX, type AppIcon } from "@/shared/icons";
import { Icon } from "./Icon";
import { Button } from "./Button";
import { IconButton } from "./IconButton";
import { DialogScope, type DialogScopeInfo } from "./DialogScope";
import { DialogShell } from "./DialogShell";
import type { GuardedAction } from "@/shared/hooks/useDiscardChanges";
import { DialogSubmissionContext } from "./dialogSubmissionContext";
import { DialogCancelContext } from "./dialogCancelContext";
import { DialogSuspendedContext } from "./dialogSuspendedContext";

/** Ignore Enter still in flight from the keypress that opened the dialog. */
export const OPEN_GRACE_MS = 100;

function entersNewline(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export interface DialogProps {
  title: string;
  /** Drawn before the title, such as the icon of the job the dialog starts. */
  icon?: AppIcon;
  scope?: DialogScopeInfo;
  description?: ReactNode;
  role?: "alertdialog" | "dialog";
  panelClassName?: string;
  busy?: boolean;
  suspended?: boolean;
  confirmDisabled?: boolean;
  onCancelAction?: (action: GuardedAction) => Promise<void>;
  onConfirm?: () => void;
  onClose: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
  describedById?: string;
  footer?: ReactNode;
  children?: ReactNode;
}

export function Dialog({
  title,
  icon,
  scope,
  description,
  role = "dialog",
  panelClassName,
  busy = false,
  suspended = false,
  confirmDisabled = false,
  onCancelAction,
  onConfirm,
  onClose,
  initialFocusRef,
  describedById,
  footer,
  children,
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const openedAtRef = useRef(0);
  const parentSuspended = useContext(DialogSuspendedContext);
  const confirm = () => {
    if (!busy && !confirmDisabled && !suspended && !parentSuspended) onConfirm?.();
  };

  useLayoutEffect(() => {
    openedAtRef.current = performance.now();
  }, []);

  return (
    <DialogShell
      block="dialog"
      role={role}
      panelClassName={panelClassName}
      labelledById={titleId}
      describedById={describedById ?? (description ? descriptionId : undefined)}
      onClose={onClose}
      onCancelAction={onCancelAction}
      onKeyDown={(event) => {
        if (
          event.defaultPrevented ||
          event.nativeEvent.isComposing ||
          event.key !== "Enter" ||
          event.shiftKey
        )
          return;
        if (entersNewline(event.target)) return;
        if (
          event.target instanceof Element &&
          event.target.closest("button, a[href], select, [role='button'], [role='combobox']")
        )
          return;
        if (performance.now() - openedAtRef.current < OPEN_GRACE_MS) return;
        event.preventDefault();
        confirm();
      }}
      busy={busy}
      suspended={suspended}
      scrollLock="dialog-open"
      backdropLabel="Close dialog"
      initialFocusRef={initialFocusRef}
    >
      <DialogSubmissionContext.Provider value={{ confirm, busy, disabled: confirmDisabled }}>
        <header className="dialog__header">
          <h2 id={titleId} className="dialog__title">
            {icon && <Icon icon={icon} className="dialog__title-icon" />}
            {title}
          </h2>
          <IconButton
            icon={iconX}
            label="Close"
            tooltip={false}
            onClick={onClose}
            disabled={busy}
          />
        </header>

        {scope && <DialogScope {...scope} />}

        {description && (
          <p id={descriptionId} className="dialog__description">
            {description}
          </p>
        )}

        {children}

        {footer && <footer className="dialog__actions">{footer}</footer>}
      </DialogSubmissionContext.Provider>
    </DialogShell>
  );
}

interface DialogActionsProps {
  confirmLabel: string;
  busyLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "primary" | "warning" | "danger";
  busy?: boolean;
  confirmDisabled?: boolean;
  onConfirm?: () => void;
  onCancel: () => void;
}

export function DialogActions({
  confirmLabel,
  busyLabel,
  cancelLabel = "Cancel",
  confirmVariant = "primary",
  busy: standaloneBusy = false,
  confirmDisabled: standaloneDisabled = false,
  onConfirm,
  onCancel,
}: DialogActionsProps) {
  const request = useContext(DialogCancelContext);
  const submission = useContext(DialogSubmissionContext);
  const busy = submission?.busy ?? standaloneBusy;
  const confirmDisabled = submission?.disabled ?? standaloneDisabled;
  return (
    <>
      <Button
        disabled={busy}
        onClick={() => {
          if (request) void request(onCancel);
          else onCancel();
        }}
      >
        {cancelLabel}
      </Button>
      <Button
        variant={confirmVariant}
        busy={busy}
        disabled={confirmDisabled}
        busyLabel={busyLabel}
        onClick={submission?.confirm ?? (() => onConfirm?.())}
      >
        {confirmLabel}
      </Button>
    </>
  );
}
