import { useState } from "react";

/**
 * True on the render where `value` changed, so a state reset lands in the same render.
 * Call it unconditionally: `useChanged(a) || useChanged(b)` would skip a hook.
 */
export function useChanged(value: unknown): boolean {
  const [previous, setPrevious] = useState(() => value);
  if (Object.is(previous, value)) return false;
  setPrevious(() => value);
  return true;
}
