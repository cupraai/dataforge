import { useEffect, useRef, type RefObject } from "react";

/** False once the component unmounts, so late async work can skip its state updates. */
export function useMountedRef(): RefObject<boolean> {
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  return mountedRef;
}
