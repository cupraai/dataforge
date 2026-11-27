import { useCallback, useState } from "react";

/** Open or closed, for a dialog or panel, with stable callbacks to change it. */
export function useOpenState() {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((current) => !current), []);
  return { open, show, close, toggle };
}
