import { useId } from "react";
import type { AppIcon } from "@/shared/icons";
import { classNames } from "@/shared/lib/classNames";
import { Icon } from "@/shared/ui/Icon";
import { Tooltip } from "@/shared/ui/Tooltip";

export interface SegmentOption<T extends string | number> {
  value: T;
  label: string;
  icon?: AppIcon;
  /** Shown after the label, such as how many items the option keeps. */
  count?: number | string;
  /** A tooltip saying what the option does, where the label alone is too short. */
  hint?: string;
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string | number> {
  /** Null checks nothing, such as a setting a multiple selection does not share. */
  value: T | null;
  options: readonly SegmentOption<T>[];
  /** The radio group's accessible name. */
  label: string;
  onChange: (value: T) => void;
  /** md for dialogs and drawers; sm for dense panes such as the editors'. */
  size?: "md" | "sm";
  /** Shares the row out evenly instead of sizing each option to its label. */
  stretch?: boolean;
  disabled?: boolean;
  className?: string;
}

/** One choice of a few, as a track of options. Native radios give it arrow-key movement. */
export function SegmentedControl<T extends string | number>({
  value,
  options,
  label,
  onChange,
  size = "md",
  stretch = false,
  disabled = false,
  className,
}: SegmentedControlProps<T>) {
  const name = useId();

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={classNames(
        "segmented",
        `segmented--${size}`,
        stretch && "segmented--stretch",
        className,
      )}
    >
      {options.map((option) => {
        const segment = (
          <label key={option.value} className="segmented__option">
            <input
              type="radio"
              className="segmented__input"
              name={name}
              value={option.value}
              checked={option.value === value}
              disabled={disabled || option.disabled}
              onChange={() => onChange(option.value)}
            />
            {option.icon && <Icon icon={option.icon} className="segmented__icon" />}
            {option.label}
            {option.count !== undefined && <span className="segmented__count">{option.count}</span>}
          </label>
        );
        return option.hint ? (
          <Tooltip key={option.value} content={option.hint} placement="top">
            {segment}
          </Tooltip>
        ) : (
          segment
        );
      })}
    </div>
  );
}
