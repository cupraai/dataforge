import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import type { CopyState } from "@/shared/hooks/useCopyFeedback";
import { iconLoader2, type AppIcon } from "@/shared/icons";
import { classNames } from "@/shared/lib/classNames";
import { Icon } from "@/shared/ui/Icon";

export type ButtonVariant = "primary" | "secondary" | "danger" | "warning" | "text";
export type ControlSize = "md" | "sm" | "xs";

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  /** Importance: one primary per surface; secondary for the rest; text for low-weight links. */
  variant?: ButtonVariant;
  size?: ControlSize;
  icon?: AppIcon;
  /** After the label, e.g. a menu chevron. */
  iconEnd?: AppIcon;
  /** Swaps the icon for a spinner and disables the button until the work ends. */
  busy?: boolean;
  /** Replaces the label while busy, e.g. "Saving...". */
  busyLabel?: ReactNode;
  /** A toggle's state; drawn with the accent surface. */
  pressed?: boolean;
  /** Icon-only: a circle, widened by a count badge; name it with `aria-label`. */
  iconOnly?: boolean;
  /** A copy button's result from `useCopyFeedback`, drawn over the variant until it clears. */
  feedback?: CopyState;
  type?: "button" | "submit";
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconEnd,
  busy = false,
  busyLabel,
  pressed,
  iconOnly = false,
  feedback = "idle",
  type = "button",
  disabled,
  className,
  children,
  ref,
  ...props
}: ButtonProps) {
  const displayIcon = busy ? iconLoader2 : icon;

  return (
    <button
      // Defaults the caller's own attributes may override.
      aria-busy={busy || undefined}
      aria-pressed={pressed}
      {...props}
      ref={ref}
      type={type}
      className={classNames(
        "button",
        `button--${variant}`,
        `button--${size}`,
        iconOnly && "button--icon-only",
        feedback !== "idle" && `button--${feedback}`,
        className,
      )}
      disabled={disabled || busy}
    >
      {displayIcon && <Icon icon={displayIcon} spin={busy} className="button__icon" />}
      {busy && busyLabel !== undefined ? busyLabel : children}
      {iconEnd && <Icon icon={iconEnd} className="button__icon" />}
    </button>
  );
}
