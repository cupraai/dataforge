import type { AppIcon } from "@/shared/icons";
import type { ShortcutDefinition } from "@/shared/lib/shortcuts";
import { Button } from "@/shared/ui/Button";
import { IconButton, type IconButtonSize } from "@/shared/ui/IconButton";
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

/** An editor toolbar button: an icon its tooltip names, or a label whose tooltip adds the key. */
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
  const button = (
    <Button
      icon={icon}
      variant="text"
      size="sm"
      pressed={pressed}
      className={className}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </Button>
  );
  // The label already names it; a tooltip only earns its place with a key or more to say.
  if (!shortcut && !tooltip) return button;
  return (
    <Tooltip content={tooltip ?? label} shortcut={shortcut} placement={tooltipPlacement}>
      {button}
    </Tooltip>
  );
}
