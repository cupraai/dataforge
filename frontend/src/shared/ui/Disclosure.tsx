import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { iconChevronDown, type AppIcon } from "@/shared/icons";
import { classNames } from "@/shared/lib/classNames";
import { Icon } from "@/shared/ui/Icon";

interface DisclosureButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "type" | "aria-expanded" | "aria-controls"
> {
  open: boolean;
  /** Id of the region the button shows and hides. */
  controls: string;
  label: ReactNode;
  icon?: AppIcon;
  /** `section` is the uppercase label; `subsection` folds a group inside a section. */
  variant?: "section" | "subsection";
  /** Trailing content inside the button, such as a count chip or a changed dot. */
  children?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * The trigger of a show/hide region: a chevron that points right when closed and down when
 * open. The region stays with the caller, which may render it hidden or not at all. Wrap the
 * button in a heading when the label titles the region.
 */
export function DisclosureButton({
  open,
  controls,
  label,
  icon,
  variant = "section",
  className,
  children,
  ...props
}: DisclosureButtonProps) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      {...props}
      className={classNames("disclosure", `disclosure--${variant}`, className)}
    >
      <Icon icon={iconChevronDown} className="disclosure__chevron" />
      {icon && <Icon icon={icon} className="disclosure__icon" />}
      <span className="disclosure__label">{label}</span>
      {children}
    </button>
  );
}
