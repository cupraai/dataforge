/** Counts above this show as "99+", so a toolbar count badge never grows past three characters. */
export const BADGE_COUNT_MAX = 99;

export function formatBadgeCount(count: number): string {
  return count > BADGE_COUNT_MAX ? `${BADGE_COUNT_MAX}+` : String(count);
}
