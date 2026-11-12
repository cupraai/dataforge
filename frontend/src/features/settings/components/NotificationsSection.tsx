import { useState } from "react";
import { iconBell } from "@/shared/icons";
import {
  readDesktopPermission,
  requestDesktopPermission,
  type DesktopPermission,
} from "@/shared/notifications/desktopNotifications";
import type { DesktopNotificationLevel } from "@/shared/types";
import { DialogSelect, type DialogSelectOption } from "@/shared/ui/DialogSelect";
import { SettingsCheckbox } from "./SettingsCheckbox";
import { SettingsGroup } from "./SettingsGroup";

const LEVEL_OPTIONS: DialogSelectOption<DesktopNotificationLevel>[] = [
  { value: "all", title: "All notifications" },
  { value: "warnings", title: "Warnings and errors" },
  { value: "errors", title: "Errors only" },
];

interface NotificationsSectionProps {
  /** The draft values. */
  desktop: boolean;
  level: DesktopNotificationLevel;
  disabled: boolean;
  onDesktopChange: (desktop: boolean) => void;
  onLevelChange: (level: DesktopNotificationLevel) => void;
}

function desktopHint(permission: DesktopPermission, desktop: boolean): string {
  if (permission === "unsupported") return "This browser cannot show desktop notifications.";
  if (permission === "denied") {
    return "This browser blocks notifications from DataForge. Allow them in its site settings first.";
  }
  if (desktop && permission === "default") {
    return "This browser has not allowed notifications yet. Turn this off and on again to ask.";
  }
  return "While DataForge is in the background, its notifications also appear on your desktop.";
}

export function NotificationsSection({
  desktop,
  level,
  disabled,
  onDesktopChange,
  onLevelChange,
}: NotificationsSectionProps) {
  const [permission, setPermission] = useState(readDesktopPermission);
  const [asking, setAsking] = useState(false);

  const change = async (checked: boolean) => {
    if (!checked) {
      onDesktopChange(false);
      return;
    }
    // Asked from the click itself, the one moment browsers allow it.
    setAsking(true);
    const result = await requestDesktopPermission();
    setAsking(false);
    setPermission(result);
    if (result === "granted") onDesktopChange(true);
  };

  return (
    <SettingsGroup title="Desktop" icon={iconBell}>
      <SettingsCheckbox
        label="Show desktop notifications"
        hint={desktopHint(permission, desktop)}
        checked={desktop}
        disabled={disabled || asking || permission === "unsupported"}
        onChange={(checked) => void change(checked)}
      />
      {desktop && (
        <DialogSelect
          label="Send to the desktop"
          value={level}
          options={LEVEL_OPTIONS}
          disabled={disabled}
          onChange={onLevelChange}
        />
      )}
    </SettingsGroup>
  );
}
