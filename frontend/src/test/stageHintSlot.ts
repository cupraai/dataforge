import { createElement, type ReactNode } from "react";
import { StageHintSlot } from "@/features/gallery/lib/stageHintSlot";

/** The item dialog's stage slot, for a panel or hint rendered on its own: pass `wrapper` to
 * `render`. Left in the body after the test, but empty: the hint unmounts with the render. */
export function stageHintSlot() {
  const slot = document.createElement("div");
  slot.dataset.testid = "stage-hint-slot";
  document.body.appendChild(slot);
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(StageHintSlot.Provider, { value: slot }, children);
  return { slot, wrapper };
}
