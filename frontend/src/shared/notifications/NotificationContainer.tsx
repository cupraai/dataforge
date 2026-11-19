import { IconButton } from "@/shared/ui/IconButton";
import { Button } from "@/shared/ui/Button";
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { iconX } from "@/shared/icons";
import { variantIcons, type NotificationVariant, type Toast } from "./notifications";
import { classNames } from "@/shared/lib/classNames";
import { Icon } from "@/shared/ui/Icon";
import { useModalPortalTarget } from "@/shared/hooks/useModalPortalTarget";

interface NotificationContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
  onRemove: (id: string) => void;
  onPauseAutoDismiss: (id: string) => void;
  onResumeAutoDismiss: (id: string) => void;
}

function notificationRole(variant: NotificationVariant): "alert" | "status" {
  return variant === "danger" ? "alert" : "status";
}

function NotificationToast({
  toast,
  onDismiss,
  onRemove,
  onPauseAutoDismiss,
  onResumeAutoDismiss,
}: { toast: Toast } & Omit<NotificationContainerProps, "toasts">) {
  const [paused, setPaused] = useState(false);
  const toastRef = useRef<HTMLDivElement>(null);

  // The exit folds the toast's own height away, so the stack closes up instead of jumping.
  useLayoutEffect(() => {
    const element = toastRef.current;
    if (toast.exiting && element) {
      element.style.setProperty("--toast-height", `${element.offsetHeight}px`);
    }
  }, [toast.exiting]);

  const hold = () => {
    if (toast.exiting) return;
    setPaused(true);
    onPauseAutoDismiss(toast.id);
  };

  const release = () => {
    if (toast.exiting) return;
    setPaused(false);
    onResumeAutoDismiss(toast.id);
  };

  return (
    <div
      ref={toastRef}
      className={classNames(
        "notifications__toast",
        `notifications__toast--${toast.variant}`,
        toast.exiting && "notifications__toast--exiting",
        paused && "notifications__toast--paused",
      )}
      role={notificationRole(toast.variant)}
      style={{ "--toast-duration": `${toast.durationMs}ms` } as CSSProperties}
      onMouseEnter={hold}
      onMouseLeave={release}
      onFocus={hold}
      onBlur={release}
      onAnimationEnd={(event) => {
        // The countdown bar finishes on a child and bubbles; only the toast's own exit unmounts it.
        if (event.currentTarget !== event.target) return;
        if (!toast.exiting) return;

        onRemove(toast.id);
      }}
    >
      <Icon icon={variantIcons[toast.variant]} className="notifications__icon" />
      <span className="notifications__message">{toast.message}</span>
      {toast.count > 1 && (
        <span className="notifications__count" aria-label={`Repeated ${toast.count} times`}>
          {`×${toast.count}`}
        </span>
      )}
      {toast.action && (
        <Button
          className="notifications__action"
          disabled={toast.exiting}
          onClick={() => {
            toast.action?.run();
            onDismiss(toast.id);
          }}
          size="xs"
        >
          {toast.action.label}
        </Button>
      )}
      <IconButton
        icon={iconX}
        label="Dismiss notification"
        className="notifications__dismiss"
        onClick={() => onDismiss(toast.id)}
        disabled={toast.exiting}
        size="xs"
        variant="ghost"
        tooltip={false}
      />
      {!toast.exiting && (
        <span className="notifications__progress" aria-hidden="true">
          <span key={toast.count} className="notifications__progress-fill" />
        </span>
      )}
    </div>
  );
}

export function NotificationContainer({ toasts, ...handlers }: NotificationContainerProps) {
  const target = useModalPortalTarget(toasts.length > 0);
  if (toasts.length === 0) {
    return null;
  }

  return createPortal(
    <div className="notifications" aria-live="polite" aria-label="Notifications">
      {toasts.map((toast) => (
        <NotificationToast key={toast.id} toast={toast} {...handlers} />
      ))}
    </div>,
    target,
  );
}
