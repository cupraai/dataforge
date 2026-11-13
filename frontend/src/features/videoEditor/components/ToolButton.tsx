import type { AppIcon } from "@/shared/icons";
import { ariaKeyShortcuts, type ShortcutDefinition } from "@/shared/lib/shortcuts";
import { Button } from "@/shared/ui/Button";
import { IconButton, type IconButtonSize } from "@/shared/ui/IconButton";
import { ShortcutHint } from "@/shared/ui/ShortcutKeys";
import { Tooltip } from "@/shared/ui/Tooltip";

interface ToolButtonProps {
  icon: AppIcon;
  label: string;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  shortcut?: ShortcutDefinition;
  className?: string;
  /** Shows the label beside the icon, for the actions a toolbar is mostly used for. */
  showLabel?: boolean;
  tooltip?: string;
  tooltipPlacement?: "top" | "bottom";
  /** Track headers use 2xs; toolbars keep the default. */
  size?: IconButtonSize;
}

/** An editor toolbar button: named, with a tooltip naming it and its key. */
export function ToolButton({
  icon,
  label,
  onClick,
  pressed,
  disabled = false,
  shortcut,
  className,
  showLabel = false,
  tooltip,
  tooltipPlacement = "top",
  size = "sm",
}: ToolButtonProps) {
  if (!showLabel) {
    return (
      <IconButton
        icon={icon}
        label={label}
        tooltip={tooltip}
        tooltipPlacement={tooltipPlacement}
        shortcut={shortcut}
        size={size}
        variant="ghost"
        pressed={pressed}
        className={className}
        onClick={onClick}
        disabled={disabled}
      />
    );
  }
  const name = tooltip ?? label;
  return (
    <Tooltip
      content={shortcut ? <ShortcutHint shortcut={shortcut}>{name}</ShortcutHint> : name}
      placement={tooltipPlacement}
    >
      <Button
        icon={icon}
        variant="text"
        size="sm"
        pressed={pressed}
        className={className}
        aria-keyshortcuts={shortcut ? ariaKeyShortcuts(shortcut) : undefined}
        onClick={onClick}
        disabled={disabled}
      >
        {label}
      </Button>
    </Tooltip>
  );
}
