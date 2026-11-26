import type { KeyboardEvent } from "react";
import { instructionApplies } from "@/shared/api/folderInstructions";
import { SYSPROMPT_FILENAME } from "@/shared/constants";
import { useFolderInstructions } from "@/shared/hooks/useFolderInstructions";
import { usePopupMenu } from "@/shared/hooks/usePopupMenu";
import { iconCheck, iconChevronDown, iconFileText, iconTriangleAlert } from "@/shared/icons";
import { instructionFileSummary } from "@/shared/lib/instructionFileState";
import { DURATION_INSTANT_MS } from "@/shared/lib/motion";
import type { SyspromptPlacement } from "@/shared/types";
import { AnchoredLayer } from "@/shared/ui/AnchoredLayer";
import { Button } from "@/shared/ui/Button";
import { Icon } from "@/shared/ui/Icon";
import { classNames } from "@/shared/lib/classNames";

const NAMES: Record<SyspromptPlacement, string> = {
  off: "Off",
  before: "Before",
  after: "After",
};

interface SyspromptPlacementMenuProps {
  value: SyspromptPlacement;
  folderPath: string;
  /** A workflow step runs on a folder chosen later, so no file is looked up. */
  editingStep?: boolean;
  disabled?: boolean;
  onChange: (placement: SyspromptPlacement) => void;
}

/**
 * Where a caption job adds the folder's system prompt beside the user's own text. It sits in
 * that text field's label row beside the Saved menu and looks like it: these dialogs have no
 * height left for another row.
 */
export function SyspromptPlacementMenu({
  value,
  folderPath,
  editingStep = false,
  disabled = false,
  onChange,
}: SyspromptPlacementMenuProps) {
  const { open, close, menuId, rootRef, panelRef, triggerProps } = usePopupMenu();
  // Looked up while the menu shows it or the trigger has to warn that nothing would be added.
  const lookUp = !editingStep && (open || value !== "off");
  const { state } = useFolderInstructions(lookUp ? folderPath : "");

  let source = `Uses the run folder's ${SYSPROMPT_FILENAME}, if it has one.`;
  let unusable = false;
  if (!editingStep) {
    if (state.status === "loading") {
      source = `Loading ${SYSPROMPT_FILENAME}...`;
    } else if (state.status === "error") {
      source = `Could not load the system prompt. ${state.message}`;
    } else {
      const file = state.instructions.sysprompt;
      if (instructionApplies(file)) {
        source = `${value === "off" ? "Would use" : "Uses"} ${file.state.relative_path}.`;
      } else {
        unusable = true;
        source =
          file.state.status === "missing"
            ? "No system prompt in this folder or above it, so nothing is added."
            : [`${instructionFileSummary(file.state)}.`, file.state.message, "Nothing is added."]
                .filter(Boolean)
                .join(" ");
      }
    }
  }
  const warn = value !== "off" && unusable;

  // The dialog closes on Escape; while the menu is open the key is the menu's.
  const handleKeyDown = (event: KeyboardEvent) => {
    if (!open || event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };

  return (
    /* oxlint-disable-next-line
       jsx-a11y/no-static-element-interactions
       -- catches Escape from the trigger and panel */
    <div ref={rootRef} className="saved-menu sysprompt-menu" onKeyDown={handleKeyDown}>
      <Button
        icon={warn ? iconTriangleAlert : iconFileText}
        iconEnd={iconChevronDown}
        disabled={disabled}
        title={warn ? source : undefined}
        {...triggerProps}
        aria-haspopup="dialog"
        size="xs"
      >
        System prompt: {NAMES[value]}
      </Button>

      <AnchoredLayer
        anchorRef={rootRef}
        floatingRef={panelRef}
        open={open}
        exitDuration={DURATION_INSTANT_MS}
        id={menuId}
        className="saved-menu__panel"
        placement="bottom-end"
        role="dialog"
        label="System prompt"
      >
        <p className="saved-menu__caption">Adds the folder's system prompt to the request.</p>
        <ul className="saved-menu__list" aria-label="Placement">
          {(Object.keys(NAMES) as SyspromptPlacement[]).map((placement) => (
            <li key={placement} className="saved-menu__row">
              <button
                type="button"
                className="saved-menu__option"
                aria-pressed={placement === value}
                onClick={() => {
                  onChange(placement);
                  close();
                }}
              >
                <Icon
                  icon={iconCheck}
                  className={classNames(
                    "saved-menu__icon",
                    placement !== value && "sysprompt-menu__unchecked",
                  )}
                />
                <span className="saved-menu__name">{NAMES[placement]}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="saved-menu__divider" role="separator" />

        <p className="saved-menu__note sysprompt-menu__source" role="status">
          <Icon icon={unusable ? iconTriangleAlert : iconFileText} className="saved-menu__icon" />
          {source}
        </p>
      </AnchoredLayer>
    </div>
  );
}
