import { Button } from "@/shared/ui/Button";
import { iconSettings } from "@/shared/icons";
import { SHORTCUTS } from "@/shared/lib/shortcuts";
import { Tooltip } from "@/shared/ui/Tooltip";

interface SettingsButtonProps {
  onOpen: () => void;
  /** Shows "Settings" beside the icon; the collapsed sidebar rail shows the icon alone. */
  showLabel: boolean;
}

export function SettingsButton({ onOpen, showLabel }: SettingsButtonProps) {
  return (
    <Tooltip content="Settings" shortcut={SHORTCUTS.settings} placement="right">
      <Button icon={iconSettings} onClick={onOpen} aria-label="Open settings">
        {showLabel && "Settings"}
      </Button>
    </Tooltip>
  );
}
