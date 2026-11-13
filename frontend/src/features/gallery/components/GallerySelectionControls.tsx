import { Button } from "@/shared/ui/Button";
import type { MediaTransferMode } from "@/features/gallery/api/media";
import { useGallerySelectionContext } from "@/features/gallery/context/GallerySelectionContext";
import { useGlobalShortcut } from "@/shared/hooks/useGlobalShortcut";
import { iconCopyPlus, iconFolderInput, iconTrash2, type AppIcon } from "@/shared/icons";
import { ariaKeyShortcuts, SHORTCUTS } from "@/shared/lib/shortcuts";
import { ShortcutHint } from "@/shared/ui/ShortcutKeys";
import { Tooltip } from "@/shared/ui/Tooltip";

interface TransferButtonProps {
  mode: MediaTransferMode;
  icon: AppIcon;
  label: string;
  transferring: MediaTransferMode | null;
  disabled: boolean;
  onClick: () => void;
}

function TransferButton({
  mode,
  icon,
  label,
  transferring,
  disabled,
  onClick,
}: TransferButtonProps) {
  const active = transferring === mode;

  return (
    <Tooltip content={label}>
      <Button
        icon={icon}
        busy={active}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        size="xs"
      >
        {mode === "copy" ? "Copy" : "Move"}
      </Button>
    </Tooltip>
  );
}

interface GallerySelectionControlsProps {
  totalCount: number;
}

export function GallerySelectionControls({ totalCount }: GallerySelectionControlsProps) {
  const {
    selectionMode,
    visibleSelectedCount,
    enterSelectionMode,
    exitSelectionMode,
    selectAllPaths,
    invertSelectedPaths,
    clearSelectedPaths,
    actions,
  } = useGallerySelectionContext();

  const { busy, deleting, transferring, openDeleteConfirm, startTransfer } = actions;

  // Escape empties a selection first, and only leaves the mode once there is nothing left to lose.
  useGlobalShortcut(
    SHORTCUTS.clearSelection,
    (event) => {
      if (event.target instanceof Element && event.target.closest(".gallery-item-dialog"))
        return false;
      if (visibleSelectedCount > 0) clearSelectedPaths();
      else exitSelectionMode();
    },
    { enabled: selectionMode, inEditable: true },
  );

  useGlobalShortcut(SHORTCUTS.selectAll, () => {
    if (!busy) selectAllPaths();
  });

  // Backspace covers Mac keyboards, where the key labelled "delete" reports Backspace.
  // Opening the confirm refuses on its own while busy or with nothing selected.
  useGlobalShortcut(SHORTCUTS.deleteSelection, () => openDeleteConfirm(), {
    enabled: selectionMode,
  });

  if (!selectionMode) {
    return (
      <div className="gallery-controls">
        <Button
          onClick={enterSelectionMode}
          aria-keyshortcuts={ariaKeyShortcuts(SHORTCUTS.selectAll)}
          size="xs"
        >
          Select
        </Button>
      </div>
    );
  }

  return (
    <div className="gallery-controls">
      <Button
        variant="primary"
        onClick={exitSelectionMode}
        disabled={busy}
        aria-label="Exit selection mode"
        size="xs"
      >
        Done
      </Button>
      <Button
        onClick={selectAllPaths}
        disabled={busy || visibleSelectedCount === totalCount}
        aria-keyshortcuts={ariaKeyShortcuts(SHORTCUTS.selectAll)}
        size="xs"
      >
        All
      </Button>
      <Button onClick={invertSelectedPaths} disabled={busy || totalCount === 0} size="xs">
        Invert
      </Button>
      <Button onClick={clearSelectedPaths} disabled={busy || visibleSelectedCount === 0} size="xs">
        None
      </Button>
      <TransferButton
        mode="copy"
        icon={iconCopyPlus}
        label="Copy selected files"
        transferring={transferring}
        disabled={visibleSelectedCount === 0 || busy}
        onClick={() => startTransfer("copy")}
      />
      <TransferButton
        mode="move"
        icon={iconFolderInput}
        label="Move selected files"
        transferring={transferring}
        disabled={visibleSelectedCount === 0 || busy}
        onClick={() => startTransfer("move")}
      />
      <Tooltip
        content={
          <ShortcutHint shortcut={SHORTCUTS.deleteSelection}>Delete selected files</ShortcutHint>
        }
      >
        <Button
          icon={iconTrash2}
          busy={deleting}
          variant="danger"
          onClick={openDeleteConfirm}
          disabled={visibleSelectedCount === 0 || busy}
          aria-label="Delete selected files"
          aria-keyshortcuts={ariaKeyShortcuts(SHORTCUTS.deleteSelection)}
          size="xs"
        >
          Delete
        </Button>
      </Tooltip>
    </div>
  );
}
