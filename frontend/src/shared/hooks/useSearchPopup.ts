import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useChanged } from "@/shared/hooks/useChanged";
import { usePopupMenu } from "@/shared/hooks/usePopupMenu";

interface SearchPopupOptions {
  /** Which entry is active when the popup opens. */
  opensAt?: () => number;
}

interface SearchPopupList {
  /** How many entries the search leaves. */
  count: number;
  /** Above 1, the arrows move through a grid. */
  columns?: number;
  onPick: (index: number) => void;
}

/**
 * A popup with a search field over a list. The field keeps the focus: the arrows move the active
 * entry, which the list marks by `optionId`, and Enter picks it.
 */
export function useSearchPopup({ opensAt = () => 0 }: SearchPopupOptions = {}) {
  const popup = usePopupMenu();
  const { open, close } = popup;
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  // Only on opening: a list that refreshes must not move the cursor.
  if (useChanged(open) && open) {
    setSearch("");
    setActive(Math.max(0, opensAt()));
  }
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const optionId = (index: number) => `${listId}-${index}`;

  /** A list can shrink under its active entry. */
  const activeOf = (count: number) => Math.max(0, Math.min(active, count - 1));

  const move = (step: number, count: number, columns: number) => {
    const current = activeOf(count);
    const next = current + step;
    if (next >= 0 && next < count) {
      setActive(next);
    } else if (next >= count) {
      // A short last row is entered at its end; from that row there is nowhere further.
      const lastRow = Math.floor((count - 1) / columns);
      if (Math.floor(current / columns) < lastRow) setActive(count - 1);
    }
  };

  const searchProps = ({ count, columns = 1, onPick }: SearchPopupList) => ({
    value: search,
    onChange: (text: string) => {
      setSearch(text);
      setActive(0);
    },
    "aria-controls": listId,
    "aria-activedescendant": count > 0 ? optionId(activeOf(count)) : undefined,
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      const steps: Record<string, number> = { ArrowUp: -columns, ArrowDown: columns };
      // In one column they move the caret through the search text.
      if (columns > 1) Object.assign(steps, { ArrowLeft: -1, ArrowRight: 1 });
      const step = steps[event.key];
      if (step !== undefined) {
        event.preventDefault();
        move(step, count, columns);
      } else if (event.key === "Enter" && count > 0) {
        event.preventDefault();
        onPick(activeOf(count));
      }
    },
  });

  // A dialog closes on Escape too; while the popup is open the key is the popup's.
  const handleRootKeyDown = (event: KeyboardEvent) => {
    if (!open || event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };

  return {
    ...popup,
    /** The search text, lowercase, for matching names. */
    needle: search.trim().toLowerCase(),
    activeOf,
    setActive,
    listId,
    optionId,
    searchRef,
    searchProps,
    handleRootKeyDown,
  };
}
