import { createContext } from "react";

/** Where an edit panel shows its hint: over the media, in the item dialog's stage. */
export const StageHintSlot = createContext<HTMLElement | null>(null);
