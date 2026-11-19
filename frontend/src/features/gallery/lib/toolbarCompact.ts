import { createContext, useContext } from "react";

/** Marks a toolbar action's text and chevron, which a crowded toolbar hides to leave the icon. */
export const COLLAPSIBLE_LABEL_CLASS = "toolbar__collapsible-label";

export const ToolbarCompactContext = createContext(false);

export function useToolbarCompact(): boolean {
  return useContext(ToolbarCompactContext);
}

export interface ToolbarRowWidths {
  /** Width the row's items may use. */
  row: number;
  /** The stats group, or 0 when it has a row of its own. */
  stats: number;
  /** The folder actions as rendered now. */
  actions: number;
  /** What the hidden labels and their gaps add back; unused while they show. */
  labels: number;
  /** The view controls' content, not the space they stretch to fill. */
  controls: number;
  gap: number;
}

/** Judged on full labels, so hiding them cannot flip-flop. */
export function toolbarNeedsCompact(widths: ToolbarRowWidths, compact: boolean): boolean {
  const actions = compact ? widths.actions + widths.labels : widths.actions;
  const items = [widths.stats, actions, widths.controls].filter((width) => width > 0);
  const needed = items.reduce((sum, width) => sum + width, 0) + widths.gap * (items.length - 1);
  return needed > widths.row + 0.5;
}
