import { useEffect, useState, type HTMLAttributes } from "react";
import { classNames } from "@/shared/lib/classNames";
import { EXIT_FALLBACK_MS } from "@/shared/lib/motion";

interface CollapseProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean;
}

/**
 * A strip that grows open and shrinks closed instead of moving what follows in one jump. It stays
 * mounted after `open` turns off until the exit ends; `className` and the rest style the content.
 */
export function Collapse({ open, className, children, ...props }: CollapseProps) {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  const closing = mounted && !open;

  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => setMounted(false), EXIT_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [closing]);

  if (!mounted) return null;
  return (
    <div
      className={classNames("collapse", closing && "collapse--exit")}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && closing) setMounted(false);
      }}
    >
      <div className="collapse__clip">
        <div {...props} className={classNames("collapse__content", className)}>
          {children}
        </div>
      </div>
    </div>
  );
}
