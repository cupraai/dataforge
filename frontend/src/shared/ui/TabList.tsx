import type { TabListState } from "@/shared/hooks/useTabList";
import type { AppIcon } from "@/shared/icons";
import { classNames } from "@/shared/lib/classNames";
import { Icon } from "@/shared/ui/Icon";

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon?: AppIcon;
  /** A dot after the label, also read out: "unsaved" edits, or edits already "changed". */
  mark?: "unsaved" | "changed";
}

interface TabListProps<T extends string> {
  /** From `useTabList`, whose `panelProps` the caller spreads on each panel. */
  tabs: TabListState<T>;
  items: readonly TabItem<T>[];
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
  items,
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
      {items.map((item) => (
        <button
          key={item.id}
          {...tabs.tabProps(item.id)}
          className="tab-list__tab"
          aria-label={item.mark ? `${item.label}, ${item.mark}` : undefined}
          disabled={disabled}
        >
          {item.icon && <Icon icon={item.icon} className="tab-list__icon" />}
          {item.label}
          {item.mark && (
            <span
              className={classNames("tab-list__dot", `tab-list__dot--${item.mark}`)}
              aria-hidden="true"
            />
          )}
        </button>
      ))}
    </div>
  );
}
