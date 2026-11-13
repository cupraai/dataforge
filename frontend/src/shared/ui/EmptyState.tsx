import type { ReactNode } from "react";
import type { AppIcon } from "@/shared/icons";
import { classNames } from "@/shared/lib/classNames";
import { Icon } from "./Icon";

interface EmptyStateProps {
  icon: AppIcon;
  title: string;
  description?: ReactNode;
  variant?: "default" | "success" | "muted" | "error";
  /** lg fills a page or a dialog's main area; sm sits in a drawer, panel or menu. */
  size?: "lg" | "sm";
  role?: "alert" | "status";
  /** Extra content under the description, such as an example. */
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  variant = "default",
  size = "lg",
  role,
  children,
  action,
  className,
}: EmptyStateProps) {
  // A compact state sits inside something that already has its own heading.
  const Title = size === "lg" ? "h2" : "p";
  return (
    <div
      className={classNames(
        "empty-state",
        `empty-state--${variant}`,
        size === "sm" && "empty-state--sm",
        className,
      )}
      role={role}
    >
      <div className="empty-state__icon-wrap" aria-hidden="true">
        <Icon icon={icon} className="empty-state__icon" />
      </div>
      <Title className="empty-state__title">{title}</Title>
      {description && <p className="empty-state__description">{description}</p>}
      {children}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  );
}
