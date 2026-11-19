import { useId, useRef, type CSSProperties } from "react";
import { useSlidingIndicator } from "@/shared/hooks/useSlidingIndicator";
import type { AppIcon } from "@/shared/icons";
import { classNames } from "@/shared/lib/classNames";
import { ariaKeyShortcuts, type ShortcutDefinition } from "@/shared/lib/shortcuts";
import { Icon } from "@/shared/ui/Icon";
import { ShortcutHint } from "@/shared/ui/ShortcutKeys";
import { Tooltip } from "@/shared/ui/Tooltip";

export interface SegmentOption<T extends string | number> {
  value: T;
  label: string;
  icon?: AppIcon;
  /** Shown after the label, such as how many items the option keeps. */
  count?: number | string;
  /** A tooltip saying what the option does, where the label alone is too short. */
  hint?: string;
  /** A key that picks this option; the tooltip shows it beside the hint and it is announced.
   * The caller binds the key itself. */
  shortcut?: ShortcutDefinition;
  /** A CSS colour or gradient the option shows when chosen, for a choice that is a look. */
  swatch?: string;
  disabled?: boolean;
}

/** Named by `label`, or by `labelledBy` where a visible caption already names the choice. */
type SegmentedControlName =
  { label: string; labelledBy?: never } | { labelledBy: string; label?: never };

type SegmentedControlProps<T extends string | number> = SegmentedControlName & {
  /** Null checks nothing, such as a setting a multiple selection does not share. */
  value: T | null;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  /** md for dialogs and drawers; sm for dense panes such as the editors'. */
  size?: "md" | "sm";
  /** Shares the row out evenly instead of sizing each option to its label. */
  stretch?: boolean;
  disabled?: boolean;
  className?: string;
};

function findCheckedOption(root: HTMLElement) {
  return root.querySelector("input:checked")?.closest<HTMLElement>(".segmented__option") ?? null;
}

/** One choice of a few, as a track of options. Native radios give it arrow-key movement. */
export function SegmentedControl<T extends string | number>({
  value,
  options,
  label,
  labelledBy,
  onChange,
  size = "md",
  stretch = false,
  disabled = false,
  className,
}: SegmentedControlProps<T>) {
  const name = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  useSlidingIndicator(rootRef, findCheckedOption, value);

  return (
    <div
      ref={rootRef}
      role="radiogroup"
      aria-label={label}
      aria-labelledby={labelledBy}
      className={classNames(
        "segmented",
        `segmented--${size}`,
        stretch && "segmented--stretch",
        className,
      )}
    >
      <span className="segmented__thumb" aria-hidden="true" />
      {options.map((option) => {
        const segment = (
          <label
            key={option.value}
            className={classNames(
              "segmented__option",
              option.swatch && "segmented__option--swatch",
            )}
            style={
              option.swatch ? ({ "--segment-swatch": option.swatch } as CSSProperties) : undefined
            }
          >
            <input
              type="radio"
              className="segmented__input"
              name={name}
              value={option.value}
              checked={option.value === value}
              disabled={disabled || option.disabled}
              aria-keyshortcuts={option.shortcut ? ariaKeyShortcuts(option.shortcut) : undefined}
              onChange={() => onChange(option.value)}
            />
            {option.icon && <Icon icon={option.icon} className="segmented__icon" />}
            {option.label}
            {option.count !== undefined && <span className="segmented__count">{option.count}</span>}
          </label>
        );
        const tip = option.shortcut ? (
          <ShortcutHint shortcut={option.shortcut}>{option.hint}</ShortcutHint>
        ) : (
          option.hint
        );
        return tip ? (
          <Tooltip key={option.value} content={tip} placement="top">
            {segment}
          </Tooltip>
        ) : (
          segment
        );
      })}
    </div>
  );
}
