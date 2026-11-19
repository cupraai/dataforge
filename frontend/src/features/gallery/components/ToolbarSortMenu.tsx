import { Button } from "@/shared/ui/Button";
import { DEFAULT_SORT, sortOptionLabel, type SortOption } from "@/features/gallery/lib/query";
import { SORT_FIELDS, sortDirectionIcon, sortFieldOf } from "@/features/gallery/lib/sortMenu";
import { usePopupMenu } from "@/shared/hooks/usePopupMenu";
import { classNames } from "@/shared/lib/classNames";
import { Menu, MenuGroup, MenuItem } from "@/shared/ui/Menu";
import { Tooltip } from "@/shared/ui/Tooltip";

interface ToolbarSortMenuProps {
  value: SortOption;
  onChange: (value: SortOption) => void;
}

/** An icon showing direction; the menu picks a field, then a direction. */
export function ToolbarSortMenu({ value, onChange }: ToolbarSortMenuProps) {
  const menu = usePopupMenu();
  const { rootRef, triggerProps } = menu;
  const current = sortFieldOf(value);

  return (
    <div ref={rootRef} className="toolbar__sort-menu">
      <Tooltip content={`Sorted by ${sortOptionLabel(value)}`}>
        <Button
          iconOnly
          icon={sortDirectionIcon(value)}
          className={classNames(
            "toolbar__sort-menu-trigger",
            value !== DEFAULT_SORT && "toolbar__sort-menu-trigger--sorted",
          )}
          aria-label="Sort media"
          {...triggerProps}
        />
      </Tooltip>

      {/* Stays open like the filter menu, so a field and then its direction take two clicks. */}
      <Menu menu={menu} label="Sort">
        <MenuGroup label="Sort by">
          {SORT_FIELDS.map((field) => (
            <MenuItem
              key={field.label}
              kind="radio"
              icon={field.icon}
              label={field.label}
              checked={field === current}
              onSelect={() => {
                if (field !== current) onChange(field.orders[0].value);
              }}
            />
          ))}
        </MenuGroup>
        <MenuGroup label="Order">
          {current.orders.map((order) => (
            <MenuItem
              key={order.value}
              kind="radio"
              icon={sortDirectionIcon(order.value)}
              label={order.label}
              checked={order.value === value}
              onSelect={() => onChange(order.value)}
            />
          ))}
        </MenuGroup>
      </Menu>
    </div>
  );
}
