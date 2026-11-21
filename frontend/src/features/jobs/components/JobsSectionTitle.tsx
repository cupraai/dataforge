import { useRef, type ReactNode } from "react";
import { useStickyFloating } from "@/shared/hooks/useStickyFloating";
import { classNames } from "@/shared/lib/classNames";

interface JobsSectionTitleProps {
  id?: string;
  children: ReactNode;
}

/** A drawer section heading that docks while its section scrolls, frosted only while docked. */
export function JobsSectionTitle({ id, children }: JobsSectionTitleProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const floating = useStickyFloating(sentinelRef, titleRef, ".jobs-dialog__content");

  return (
    <>
      <div ref={sentinelRef} className="sticky-sentinel" aria-hidden="true" />
      <h3
        ref={titleRef}
        id={id}
        className={classNames(
          "jobs-dialog__section-title",
          floating && "jobs-dialog__section-title--floating",
        )}
      >
        {children}
      </h3>
    </>
  );
}
