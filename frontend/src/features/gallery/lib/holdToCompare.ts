import type { KeyboardEvent, PointerEvent } from "react";

/** Down by pointer, Space or Enter shows the original; any release shows the edit. */
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
