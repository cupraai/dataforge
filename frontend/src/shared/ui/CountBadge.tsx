import { formatBadgeCount } from "@/shared/lib/badgeCount";
import { classNames } from "@/shared/lib/classNames";
import { RollingNumber } from "@/shared/ui/RollingNumber";

type CountBadgeTone = "accent" | "warning" | "danger";

interface CountBadgeProps {
  count: number;
  tone?: CountBadgeTone;
}

/**
 * The solid count pill inside a toolbar button, such as unseen jobs or notifications. Hidden from
 * screen readers: the button's own label carries the exact count. Renders nothing at zero.
 */
export function CountBadge({ count, tone = "accent" }: CountBadgeProps) {
  if (count <= 0) return null;

  return (
    <span
      className={classNames("count-badge", tone !== "accent" && `count-badge--${tone}`)}
      aria-hidden="true"
    >
      <RollingNumber value={formatBadgeCount(count)} />
    </span>
  );
}
