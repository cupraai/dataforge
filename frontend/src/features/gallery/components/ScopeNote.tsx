import { type ReviewScope, reviewScopeNote } from "@/features/gallery/lib/reviewScope";
import { iconLayers } from "@/shared/icons";
import { Icon } from "@/shared/ui/Icon";

/** Which files a menu's actions cover, by the same rule as bulk jobs. */
export function ScopeNote({ scope }: { scope: ReviewScope | undefined }) {
  return (
    <span className="menu__scope">
      <Icon icon={iconLayers} />
      <span className="menu__scope-label">Scope</span>
      {reviewScopeNote(scope)}
    </span>
  );
}
