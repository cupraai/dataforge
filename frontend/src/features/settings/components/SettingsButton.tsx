import { Button } from "@/shared/ui/Button";
import { iconSettings } from "@/shared/icons";
import { ariaKeyShortcuts, SHORTCUTS } from "@/shared/lib/shortcuts";
import { ShortcutHint } from "@/shared/ui/ShortcutKeys";
import { Tooltip } from "@/shared/ui/Tooltip";

interface SettingsButtonProps {
  onOpen: () => void;
  /** Shows "Settings" beside the icon; the collapsed sidebar rail shows the icon alone. */
  showLabel: boolean;
}

export function SettingsButton({ onOpen, showLabel }: SettingsButtonProps) {
  return (
    <Tooltip
      content={<ShortcutHint shortcut={SHORTCUTS.settings}>Settings</ShortcutHint>}
      placement="right"
    >
      <Button
        icon={iconSettings}
        onClick={onOpen}
        aria-label="Open settings"
        aria-keyshortcuts={ariaKeyShortcuts(SHORTCUTS.settings)}
      >
        {showLabel && "Settings"}
      </Button>
    </Tooltip>
  );
}
