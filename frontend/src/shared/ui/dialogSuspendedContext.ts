import { createContext } from "react";

/** True while dialogs below must not act, as during a navigation or an exit. */
export const DialogSuspendedContext = createContext(false);
