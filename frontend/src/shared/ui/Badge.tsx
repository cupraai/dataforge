import type { HTMLAttributes } from "react";
import type { AppIcon } from "@/shared/icons";
import { classNames } from "@/shared/lib/classNames";
import { Icon } from "@/shared/ui/Icon";

/** `placeholder` is a dashed outline for something absent, such as "+3 more" or a missing file. */
export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "placeholder";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** sm beside 2xs text such as card meta; md in rows of xs text. */
  size?: "sm" | "md";
  /** Statuses are uppercase; names, such as tags, keep their own case. */
  uppercase?: boolean;
  icon?: AppIcon;
  /** Spins the icon, for work in progress. */
  spin?: boolean;
}

/** A one-line pill that labels a state or names a thing; not interactive. */
export function Badge({
  tone = "neutral",
  size = "sm",
  uppercase = true,
  icon,
  spin = false,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      {...props}
      className={classNames(
        "badge",
        `badge--${tone}`,
        `badge--${size}`,
        !uppercase && "badge--plain",
        icon && "badge--icon",
        className,
      )}
    >
      {icon ? (
        <>
          <Icon icon={icon} spin={spin} className="badge__icon" />
          <span className="badge__label">{children}</span>
        </>
      ) : (
        children
      )}
    </span>
  );
}
