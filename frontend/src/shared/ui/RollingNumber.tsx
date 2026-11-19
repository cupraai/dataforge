import type { CSSProperties } from "react";
import { classNames } from "@/shared/lib/classNames";

interface RollingNumberProps {
  value: number | string;
  className?: string;
}

/**
 * A count whose digits roll to their new value, like an odometer. The digits are drawn by CSS
 * from `--digit`, so the element's text, and what screen readers and tests read, is the value.
 */
export function RollingNumber({ value, className }: RollingNumberProps) {
  const text = String(value);
  // Counts and their marks are ASCII, one character per column.
  const chars = text.split("");

  return (
    <span className={classNames("rolling-number", className)}>
      <span className="rolling-number__text">{text}</span>
      <span className="rolling-number__digits" aria-hidden="true">
        {chars.map((char, index) => {
          // Keyed from the right, so the units keep rolling when the number gains a digit.
          const place = chars.length - index;
          return /\d/.test(char) ? (
            <span
              key={`digit-${place}`}
              className="rolling-number__digit"
              style={{ "--digit": char } as CSSProperties}
            />
          ) : (
            <span key={`char-${place}-${char}`} className="rolling-number__char" data-char={char} />
          );
        })}
      </span>
    </span>
  );
}
