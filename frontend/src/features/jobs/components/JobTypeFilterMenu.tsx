import { Button } from "@/shared/ui/Button";
import type { KeyboardEvent } from "react";
import { JOB_TYPE_FILTER_OPTIONS, toggleJobType } from "@/features/jobs/lib/jobFilters";
import { usePopupMenu } from "@/shared/hooks/usePopupMenu";
import { iconChevronDown } from "@/shared/icons";
import type { JobType } from "@/shared/types";
import { Menu, MenuItem, MenuSeparator } from "@/shared/ui/Menu";

interface JobTypeFilterMenuProps {
  /** Empty means every type. */
  value: JobType[];
  onChange: (value: JobType[]) => void;
}

function summaryFor(value: readonly JobType[]): string {
  if (value.length === 0) return "All types";
  if (value.length > 1) return `${value.length} types`;
  return JOB_TYPE_FILTER_OPTIONS.find((option) => option.value === value[0])?.title ?? value[0];
}

/** Multi-select type filter; stays open on pick so several types can be toggled in a row. */
export function JobTypeFilterMenu({ value, onChange }: JobTypeFilterMenuProps) {
  const menu = usePopupMenu();
  const { open, close, rootRef, triggerProps } = menu;
  const summary = summaryFor(value);

  // Stopped here so Escape closes only the menu, not the drawer.
  const handleKeyDown = (event: KeyboardEvent) => {
    if (!open || event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };

  return (
    /* oxlint-disable-next-line
       jsx-a11y/no-static-element-interactions
       -- catches Escape from the trigger and menu */
    <div ref={rootRef} className="jobs-dialog__type" onKeyDown={handleKeyDown}>
      {/* Accent while a type filter is in force, like the pressed "This folder" beside it. */}
      <Button
        variant={value.length > 0 ? "primary" : "secondary"}
        size="sm"
        iconEnd={iconChevronDown}
        className="jobs-dialog__type-trigger"
        aria-label={`Type: ${summary}`}
        {...triggerProps}
      >
        <span className="jobs-dialog__type-trigger-label">{summary}</span>
      </Button>

      <Menu
        menu={menu}
        label="Job types"
        placement="bottom-start"
        className="jobs-dialog__type-panel"
      >
        <MenuItem
          kind="checkbox"
          checked={value.length === 0}
          label="All types"
          onSelect={() => onChange([])}
        />
        <MenuSeparator />
        {JOB_TYPE_FILTER_OPTIONS.map((option) => (
          <MenuItem
            key={option.value}
            kind="checkbox"
            checked={value.includes(option.value)}
            label={option.title}
            onSelect={() => onChange(toggleJobType(value, option.value))}
          />
        ))}
      </Menu>
    </div>
  );
}
