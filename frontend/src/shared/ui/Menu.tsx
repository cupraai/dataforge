import { useId, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import type { PopupMenu } from "@/shared/hooks/usePopupMenu";
import type { AnchoredOptions } from "@/shared/hooks/useAnchoredPosition";
import { iconCheck, type AppIcon } from "@/shared/icons";
import { classNames } from "@/shared/lib/classNames";
import { AnchoredLayer } from "@/shared/ui/AnchoredLayer";
import { Icon } from "@/shared/ui/Icon";

const ITEM_SELECTOR = '[role^="menuitem"]:not(:disabled)';
const STEP_KEYS: Record<string, (index: number, count: number) => number> = {
  ArrowDown: (index, count) => (index + 1) % count,
  ArrowUp: (index, count) => (index <= 0 ? count : index) - 1,
  Home: () => 0,
  End: (_index, count) => count - 1,
};

interface MenuProps extends AnchoredOptions {
  menu: PopupMenu;
  label: string;
  /** Width and height caps; the surface and the items come from the menu itself. */
  className?: string;
  children: ReactNode;
}

/** The panel of a `usePopupMenu` menu. Arrows, Home and End move between its enabled items. */
export function Menu({ menu, label, className, children, ...options }: MenuProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = STEP_KEYS[event.key];
    if (!step) return;
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>(ITEM_SELECTOR)];
    if (items.length === 0) return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLElement);
    items[step(index, items.length)].focus();
  };

  return (
    <AnchoredLayer
      {...options}
      anchorRef={menu.rootRef}
      floatingRef={menu.panelRef}
      open={menu.open}
      id={menu.menuId}
      role="menu"
      label={label}
      className={classNames("menu", className)}
      onKeyDown={handleKeyDown}
    >
      {children}
    </AnchoredLayer>
  );
}

interface MenuItemProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "type" | "role" | "onClick" | "onSelect" | "children"
> {
  /** Radio items show the chosen one in accent; checkbox items show a check. */
  kind?: "action" | "radio" | "checkbox";
  checked?: boolean;
  /** Where the user already is, such as the open folder among its siblings. */
  current?: boolean;
  /** In accent without being a choice, such as a range filter in force. */
  active?: boolean;
  icon?: AppIcon;
  label: ReactNode;
  /** A second line under the label. */
  description?: ReactNode;
  /** A count pill at the end, such as how many items the choice keeps. */
  count?: ReactNode;
  /** Anything else at the end, such as the item's shortcut. */
  trailing?: ReactNode;
  tone?: "danger";
  onSelect: () => void;
}

export function MenuItem({
  kind = "action",
  checked = false,
  current = false,
  active = false,
  icon,
  label,
  description,
  count,
  trailing,
  tone,
  onSelect,
  className,
  ...props
}: MenuItemProps) {
  const role =
    kind === "radio" ? "menuitemradio" : kind === "checkbox" ? "menuitemcheckbox" : "menuitem";
  return (
    <button
      {...props}
      type="button"
      role={role}
      aria-checked={kind === "action" ? undefined : checked}
      aria-current={current || undefined}
      className={classNames(
        "menu__item",
        ((kind === "radio" && checked) || current || active) && "menu__item--active",
        tone && `menu__item--${tone}`,
        className,
      )}
      onClick={onSelect}
    >
      {kind === "checkbox" && (
        <Icon
          icon={iconCheck}
          className={classNames("menu__check", checked && "menu__check--on")}
        />
      )}
      {icon && <Icon icon={icon} className="menu__icon" />}
      {description ? (
        <span className="menu__text">
          <span className="menu__label">{label}</span>
          <span className="menu__description">{description}</span>
        </span>
      ) : (
        <span className="menu__label">{label}</span>
      )}
      {count !== undefined && <span className="menu__count">{count}</span>}
      {trailing}
    </button>
  );
}

/** A labelled run of items; groups after the first get a rule above. */
export function MenuGroup({ label, children }: { label: string; children: ReactNode }) {
  const labelId = useId();
  return (
    <div className="menu__group" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="menu__group-label">
        {label}
      </span>
      {children}
    </div>
  );
}

/** A muted line under the items, ruled off from them, such as the scope the actions cover. */
export function MenuFooter({ children }: { children: ReactNode }) {
  return (
    <div className="menu__footer" role="none">
      {children}
    </div>
  );
}

export function MenuSeparator() {
  return <div className="menu__separator" role="separator" />;
}
