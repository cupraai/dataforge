import { useRef, type MouseEvent, type SelectHTMLAttributes } from "react";
import { classNames } from "@/shared/lib/classNames";

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  /** md in dialogs; sm in tool rows; xs in the editor inspector. */
  size?: "md" | "sm" | "xs";
  /** Classes on the bordered wrap, which is the element a parent's layout sees. */
  className?: string;
}

/** A native select in the shared field styling; the options are its children. */
export function Select({ size = "md", className, children, ...props }: SelectProps) {
  const selectRef = useRef<HTMLSelectElement>(null);

  // Clicks on the wrap's padding miss the select, so open the picker by hand.
  const handleWrapMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    const select = selectRef.current;
    if (!select || select.disabled || event.target === select) return;

    // Otherwise the div takes focus off the select.
    event.preventDefault();
    select.focus();
    if (typeof select.showPicker === "function") select.showPicker();
  };

  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- forwards gutter clicks
    <div
      className={classNames("select", size !== "md" && `select--${size}`, className)}
      onMouseDown={handleWrapMouseDown}
    >
      <select {...props} ref={selectRef} className="select__control">
        {children}
      </select>
    </div>
  );
}
