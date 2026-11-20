import { Button } from "@/shared/ui/Button";
import { useEffect } from "react";
import { usePopupMenu } from "@/shared/hooks/usePopupMenu";
import { iconBell, iconBellRing } from "@/shared/icons";
import { classNames } from "@/shared/lib/classNames";
import { AnchoredLayer } from "@/shared/ui/AnchoredLayer";
import { CountBadge } from "@/shared/ui/CountBadge";
import { Icon } from "@/shared/ui/Icon";
import { Tooltip } from "@/shared/ui/Tooltip";
import { NotificationsPanel } from "./NotificationsPanel";
import { useNotificationHistory } from "./notifications";
import { DURATION_INSTANT_MS } from "@/shared/lib/motion";

export function NotificationsButton() {
  const {
    history,
    unreadCount,
    setPanelOpen,
    markAllRead,
    clearHistory,
    refreshHistory,
    actionFor,
  } = useNotificationHistory();
  const { open, close, menuId, rootRef, panelRef, triggerProps } = usePopupMenu();

  // Read state is flushed on close: marking on open would erase the unread marks being read.
  useEffect(() => {
    setPanelOpen(open);
    if (!open) return;

    refreshHistory();
    return () => markAllRead();
  }, [open, setPanelOpen, markAllRead, refreshHistory]);

  const unread = unreadCount > 0;
  const unreadVariants = new Set(history.filter((entry) => !entry.read_at).map((e) => e.variant));
  const urgent = unreadVariants.has("danger");
  const warning = !urgent && unreadVariants.has("warning");
  const label = unread ? `Notifications (${unreadCount} new)` : "Notifications";
  const tooltip = unread
    ? `${unreadCount} new ${unreadCount === 1 ? "notification" : "notifications"}`
    : "Notifications";

  return (
    <div ref={rootRef} className="notifications-button-wrap">
      <Tooltip content={tooltip}>
        <Button
          iconOnly
          className={classNames(
            "notifications-button",
            unread && "notifications-button--unread",
            urgent && "notifications-button--urgent",
            warning && "notifications-button--warning",
          )}
          aria-label={label}
          {...triggerProps}
        >
          {/* Keyed by the count so each new arrival replays the ring. */}
          <Icon
            key={unreadCount}
            icon={unread ? iconBellRing : iconBell}
            className="button__icon notifications-button__icon"
          />
          <CountBadge
            count={unreadCount}
            tone={urgent ? "danger" : warning ? "warning" : "accent"}
          />
        </Button>
      </Tooltip>

      <AnchoredLayer
        anchorRef={rootRef}
        floatingRef={panelRef}
        open={open}
        exitDuration={DURATION_INSTANT_MS}
        id={menuId}
        className="notifications-panel"
        role="group"
        label="Notifications"
      >
        <NotificationsPanel
          history={history}
          actionFor={actionFor}
          onClear={clearHistory}
          onActionDone={close}
        />
      </AnchoredLayer>
    </div>
  );
}
