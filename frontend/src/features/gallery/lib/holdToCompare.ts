import type { KeyboardEvent, PointerEvent } from "react";

/** Handlers for a hold-to-compare button: down by pointer, Space or Enter shows the original,
 * and any way of letting go (including losing focus or capture) shows the edit again. */
export function holdToCompareProps(setHolding: (holding: boolean) => void) {
  const release = () => setHolding(false);
  return {
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      setHolding(true);
    },
    onPointerUp: release,
    onPointerCancel: release,
    onLostPointerCapture: release,
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      setHolding(true);
    },
    onKeyUp: release,
    onBlur: release,
  };
}
