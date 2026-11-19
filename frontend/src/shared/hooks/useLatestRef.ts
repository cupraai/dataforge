import { useInsertionEffect, useRef } from "react";
import type { RefObject } from "react";

/**
 * The last committed `value`, for once-registered callbacks; never read during render.
 * Set in an insertion effect, so a child's layout effect already sees it.
 */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useInsertionEffect(() => {
    ref.current = value;
  });
  return ref;
}
