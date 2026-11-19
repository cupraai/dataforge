import { COLLAPSIBLE_LABEL_CLASS } from "@/features/gallery/lib/toolbarCompact";
import { iconChevronDown } from "@/shared/icons";
import { Icon } from "@/shared/ui/Icon";

/**
 * A toolbar menu button's trailing chevron, which a crowded toolbar drops with the label. Its
 * wrapper carries the label class, so the compact check counts its width as room won back.
 */
export function ToolbarMenuChevron() {
  return (
    <span className={COLLAPSIBLE_LABEL_CLASS}>
      <Icon icon={iconChevronDown} className="button__icon" />
    </span>
  );
}
