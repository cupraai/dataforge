import type { InputHTMLAttributes, Ref } from "react";
import { iconSearch, iconX } from "@/shared/icons";
import { classNames } from "@/shared/lib/classNames";
import { Icon } from "@/shared/ui/Icon";
import { IconButton } from "@/shared/ui/IconButton";

interface SearchInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "size" | "value" | "onChange" | "aria-label"
> {
  value: string;
  onChange: (value: string) => void;
  /** The field's accessible name. */
  label: string;
  /** Names the clear button, which shows once there is something to clear. */
  clearLabel?: string;
  /** sm for toolbars and dialogs; xs for the editor's inspector. */
  size?: "sm" | "xs";
  /** On the wrapper, which is what a parent's layout sees. */
  className?: string;
  ref?: Ref<HTMLInputElement>;
}

/** A search box with a clear button while it holds text. */
export function SearchInput({
  value,
  onChange,
  label,
  clearLabel = "Clear the search",
  size = "sm",
  className,
  ...props
}: SearchInputProps) {
  return (
    <label className={classNames("search-input", size === "xs" && "search-input--xs", className)}>
      <Icon icon={iconSearch} className="search-input__icon" />
      <input
        {...props}
        type="search"
        className="search-input__field"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <IconButton
          icon={iconX}
          label={clearLabel}
          tooltip={false}
          size="2xs"
          variant="ghost"
          className="search-input__clear"
          onClick={() => onChange("")}
        />
      )}
    </label>
  );
}
