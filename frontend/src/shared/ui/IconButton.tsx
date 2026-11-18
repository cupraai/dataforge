import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { iconLoader2, type AppIcon } from "@/shared/icons";
import type { AnchoredSide } from "@/shared/lib/anchoredPosition";
import { classNames } from "@/shared/lib/classNames";
import { ariaKeyShortcuts, type ShortcutDefinition } from "@/shared/lib/shortcuts";
import { Icon } from "@/shared/ui/Icon";
import { ShortcutHint } from "@/shared/ui/ShortcutKeys";
import { Tooltip } from "@/shared/ui/Tooltip";

export type IconButtonSize = "lg" | "md" | "sm" | "xs" | "2xs";

interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "type" | "aria-label"
> {
  icon: AppIcon;
  /** The accessible name, and the tooltip unless `tooltip` says otherwise. */
  label: string;
  /** Tooltip content when it should say more than the label; false where the name shows nearby. */
  tooltip?: ReactNode | false;
  tooltipPlacement?: AnchoredSide;
  shortcut?: ShortcutDefinition;
  /** lg is for round controls over media; 2xs for buttons inside a field, such as a clear. */
  size?: IconButtonSize;
  /** Surface is bordered; ghost is bare until hovered, for dense toolbars and fields. */
  variant?: "surface" | "ghost";
  /** Hover colour for an action that is not neutral, such as delete. */
  tone?: "accent" | "danger" | "warning";
  /** Round only for controls floating over media. */
  shape?: "square" | "round";
  pressed?: boolean;
  busy?: boolean;
  type?: "button" | "submit";
  ref?: Ref<HTMLButtonElement>;
}

export function IconButton({
  icon,
  label,
  tooltip,
  tooltipPlacement,
  shortcut,
  size = "md",
  variant = "surface",
  tone,
  shape = "square",
  pressed,
  busy = false,
  type = "button",
  disabled,
  className,
  children,
  ref,
  ...props
}: IconButtonProps) {
  const button = (
    <button
      // Defaults the caller's own attributes may override.
      aria-pressed={pressed}
      aria-busy={busy || undefined}
      aria-keyshortcuts={shortcut ? ariaKeyShortcuts(shortcut) : undefined}
      {...props}
      ref={ref}
      type={type}
      className={classNames(
        "icon-button",
        `icon-button--${size}`,
        `icon-button--${variant}`,
        tone && `icon-button--${tone}`,
        shape === "round" && "icon-button--round",
        className,
      )}
      aria-label={label}
      disabled={disabled || busy}
    >
      <Icon icon={busy ? iconLoader2 : icon} spin={busy} />
      {children}
    </button>
  );

  if (tooltip === false) return button;
  const content = tooltip ?? label;
  return (
    <Tooltip
      content={shortcut ? <ShortcutHint shortcut={shortcut}>{content}</ShortcutHint> : content}
      placement={tooltipPlacement}
    >
      {button}
    </Tooltip>
  );
}
