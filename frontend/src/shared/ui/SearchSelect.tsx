import { useEffect, useRef, type ReactNode } from "react";
import { useSearchPopup } from "@/shared/hooks/useSearchPopup";
import { iconCheck, iconChevronDown, type AppIcon } from "@/shared/icons";
import { classNames } from "@/shared/lib/classNames";
import { DURATION_INSTANT_MS } from "@/shared/lib/motion";
import { AnchoredLayer } from "@/shared/ui/AnchoredLayer";
import { Button } from "@/shared/ui/Button";
import { Icon } from "@/shared/ui/Icon";
import { SearchInput } from "@/shared/ui/SearchInput";

export interface SearchSelectOption {
  value: string;
  label: string;
  /** Shown dimmed after the label, and searched too. */
  detail?: string;
}

interface SearchSelectProps {
  /** Names the list and the search field, e.g. "LoRAs". */
  label: string;
  options: readonly SearchSelectOption[];
  /** Ticked in the list. */
  selected?: readonly string[];
  onPick: (value: string) => void;
  /** The trigger button's text. */
  triggerLabel: ReactNode;
  /** The trigger's accessible name when its text alone does not say what it picks. */
  triggerAriaLabel?: string;
  triggerIcon?: AppIcon;
  triggerClassName?: string;
  /** Shown when nothing matches, or nothing is listed. */
  emptyText: string;
  loading?: boolean;
  disabled?: boolean;
  /** Below the list, e.g. a refresh or a shortcut; closes nothing by itself. */
  footer?: (close: () => void) => ReactNode;
}

/** A button that opens a searchable list; picking closes it. The search field keeps focus. */
export function SearchSelect({
  label,
  options,
  selected = [],
  onPick,
  triggerLabel,
  triggerAriaLabel,
  triggerIcon,
  triggerClassName,
  emptyText,
  loading = false,
  disabled = false,
  footer,
}: SearchSelectProps) {
  const {
    open,
    close,
    menuId,
    rootRef,
    panelRef,
    triggerProps,
    needle,
    activeOf,
    setActive,
    listId,
    optionId,
    searchRef,
    searchProps,
    handleRootKeyDown,
  } = useSearchPopup();
  const listRef = useRef<HTMLUListElement>(null);

  const matches = needle
    ? options.filter((option) =>
        `${option.label} ${option.detail ?? ""}`.toLowerCase().includes(needle),
      )
    : options;
  const active = activeOf(matches.length);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [active, open]);

  const pick = (value: string) => {
    onPick(value);
    close();
  };

  return (
    /* oxlint-disable-next-line
       jsx-a11y/no-static-element-interactions
       -- catches Escape from the trigger and panel */
    <div ref={rootRef} className="search-select" onKeyDown={handleRootKeyDown}>
      <Button
        icon={triggerIcon}
        iconEnd={iconChevronDown}
        disabled={disabled}
        className={triggerClassName}
        aria-label={triggerAriaLabel}
        {...triggerProps}
        aria-haspopup="dialog"
        size="sm"
      >
        {triggerLabel}
      </Button>
      <AnchoredLayer
        anchorRef={rootRef}
        floatingRef={panelRef}
        open={open}
        exitDuration={DURATION_INSTANT_MS}
        id={menuId}
        className="search-select__panel"
        role="dialog"
        label={label}
        placement="bottom-start"
      >
        <SearchInput
          ref={searchRef}
          label={`Search ${label.toLowerCase()}`}
          placeholder={`Search ${label.toLowerCase()}`}
          {...searchProps({
            count: matches.length,
            onPick: (index) => pick(matches[index].value),
          })}
        />
        <ul
          ref={listRef}
          id={listId}
          className="search-select__list"
          role="listbox"
          aria-label={label}
        >
          {matches.map((option, index) => {
            const chosen = selected.includes(option.value);
            return (
              /* oxlint-disable-next-line
                 jsx-a11y/click-events-have-key-events
                 -- activedescendant option; the input keeps focus */
              <li
                key={option.value}
                id={optionId(index)}
                data-index={index}
                role="option"
                aria-selected={chosen}
                className={classNames(
                  "search-select__option",
                  index === active && "search-select__option--active",
                )}
                onPointerMove={() => setActive(index)}
                onClick={() => pick(option.value)}
              >
                <span className="search-select__check" aria-hidden="true">
                  {chosen && <Icon icon={iconCheck} />}
                </span>
                <span className="search-select__label">{option.label}</span>
                {option.detail && <span className="search-select__detail">{option.detail}</span>}
              </li>
            );
          })}
          {matches.length === 0 && (
            <li className="search-select__empty" role="presentation">
              {loading ? "Loading..." : emptyText}
            </li>
          )}
        </ul>
        {footer && <div className="search-select__footer">{footer(close)}</div>}
      </AnchoredLayer>
    </div>
  );
}
