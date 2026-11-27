import { Button } from "@/shared/ui/Button";
import { iconBellOff } from "@/shared/icons";
import { useTicker } from "@/shared/hooks/useTicker";
import { formatRelativeTime } from "@/shared/lib/format";
import { classNames } from "@/shared/lib/classNames";
import { EmptyState } from "@/shared/ui/EmptyState";
import { Icon } from "@/shared/ui/Icon";
import { variantIcons, type NotificationActionFor } from "./notifications";
import type { NotificationRecord } from "@/shared/types";

const RETICK_MS = 30_000;

interface NotificationsPanelProps {
  history: NotificationRecord[];
  actionFor: NotificationActionFor;
  onClear: () => void;
  /** After a row's follow-up ran: it leads somewhere else, so the panel closes. */
  onActionDone: () => void;
}

export function NotificationsPanel({
  history,
  actionFor,
  onClear,
  onActionDone,
}: NotificationsPanelProps) {
  const nowMs = useTicker(RETICK_MS);

  if (history.length === 0) {
    return (
      <div className="notifications-panel__empty">
        <EmptyState
          size="sm"
          icon={iconBellOff}
          title="No notifications"
          description="Job results and errors show up here."
          variant="muted"
        />
      </div>
    );
  }

  return (
    <>
      <div className="notifications-panel__header">
        <h2 className="notifications-panel__title">Notifications</h2>
        <Button onClick={onClear} variant="danger" size="xs">
          Clear all
        </Button>
      </div>

      <ul className="notifications-panel__list">
        {history.map((entry) => {
          const action = actionFor(entry);
          return (
            <li
              key={entry.id}
              className={classNames(
                "notifications-panel__row",
                `notifications-panel__row--${entry.variant}`,
                !entry.read_at && "notifications-panel__row--unread",
              )}
            >
              <Icon icon={variantIcons[entry.variant]} className="notifications-panel__row-icon" />
              <div className="notifications-panel__row-body">
                <p className="notifications-panel__row-message">{entry.message}</p>
                <span className="notifications-panel__row-meta">
                  {formatRelativeTime(entry.created_at, nowMs)}
                  {entry.count > 1 && (
                    <span className="notifications-panel__row-count">{`×${entry.count}`}</span>
                  )}
                </span>
              </div>
              {action && (
                <Button
                  onClick={() => {
                    action.run();
                    onActionDone();
                  }}
                  size="xs"
                >
                  {action.label}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
