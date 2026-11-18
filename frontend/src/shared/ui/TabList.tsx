import type { TabListState } from "@/shared/hooks/useTabList";
import type { AppIcon } from "@/shared/icons";
import { classNames } from "@/shared/lib/classNames";
import { Icon } from "@/shared/ui/Icon";

export interface TabItem {
  label: string;
  icon?: AppIcon;
  /** A dot after the label, also read out: "unsaved" edits, or edits already "changed". */
  mark?: "unsaved" | "changed";
}

interface TabListProps<T extends string> {
  /** From `useTabList`: its ids are the tabs, in order; the caller spreads `panelProps`. */
  tabs: TabListState<T>;
  /** How each of those ids reads as a tab. */
  item: (id: T) => TabItem;
  /** The tab list's accessible name. */
  label: string;
  /** sm for dense panes such as the video editor's. */
  size?: "md" | "sm";
  disabled?: boolean;
  /** Layout only: padding and the rule under the row belong to the surface. */
  className?: string;
}

/** Underlined tabs: the selected one's bar sits on the row's bottom rule. */
export function TabList<T extends string>({
  tabs,
  item,
  label,
  size = "md",
  disabled = false,
  className,
}: TabListProps<T>) {
  return (
    <div
      {...tabs.tabListProps}
      aria-label={label}
      className={classNames("tab-list", `tab-list--${size}`, className)}
    >
      {tabs.ids.map((id) => {
        const { label: name, icon, mark } = item(id);
        return (
          <button
            key={id}
            {...tabs.tabProps(id)}
            className="tab-list__tab"
            aria-label={mark ? `${name}, ${mark}` : undefined}
            disabled={disabled}
          >
            {icon && <Icon icon={icon} className="tab-list__icon" />}
            {name}
            {mark && (
              <span
                className={classNames("tab-list__dot", `tab-list__dot--${mark}`)}
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
