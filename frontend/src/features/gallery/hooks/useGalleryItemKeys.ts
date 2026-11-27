import { useEffect, type RefObject } from "react";
import type { WorkspaceAction } from "@/app/hooks/useWorkspaceTransitions";
import { isResolvableIssueItem } from "@/features/gallery/lib/issues";
import { isUncaptionedItem, nextIndexWhere } from "@/features/gallery/lib/reviewJump";
import { getScrollLockDepth } from "@/shared/hooks/scrollLockManager";
import { isEditableTarget } from "@/shared/lib/isEditableTarget";
import { matchesShortcut, queueIndexAfter, queueStepFor, SHORTCUTS } from "@/shared/lib/shortcuts";
import { useNotify } from "@/shared/notifications/notifications";
import type { GalleryItem } from "@/shared/types";

type ReviewJump = "uncaptioned" | "issue";

const REVIEW_JUMPS: Record<ReviewJump, { matches: (item: GalleryItem) => boolean; none: string }> =
  {
    uncaptioned: { matches: isUncaptionedItem, none: "No other uncaptioned files." },
    issue: { matches: isResolvableIssueItem, none: "No other files with an issue." },
  };

// Widgets outside the inspector that use arrow keys themselves.
const OUTSIDE_ARROW_OWNERS =
  '[role="menu"], [role="listbox"], [role="slider"], [role="separator"], [role="tablist"], select';

interface GalleryItemKeysOptions {
  items: GalleryItem[];
  index: number;
  item: GalleryItem | undefined;
  /** A covering dialog or running work: no key reaches the viewer. */
  blocked: boolean;
  /** Docked beside the gallery, where only closing and paging reach past the panel. */
  inline: boolean;
  panelRef: RefObject<HTMLElement | null>;
  /** Edit or frame mode, which keeps paging, Delete and the review keys to itself. */
  modeOwnsKeys: boolean;
  showingBackupDiff: boolean;
  onLeaveComparison: () => void;
  /** Runs an action that leaves the item once its unsaved work is settled. */
  leave: (action: WorkspaceAction) => unknown;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onGoTo?: (index: number) => void;
  flushPendingSave: () => Promise<boolean>;
  /** Focuses the caption of the item a save-and-next lands on. */
  onFocusCaptionOf: (path: string) => void;
  onDelete: () => void;
  /** Set only where the file can be moved. */
  onMove?: () => void;
  onToggleSelect?: (path: string) => void;
}

/** The viewer's keys: paging, review jumps, save-and-next, delete, move and select. */
export function useGalleryItemKeys({
  items,
  index,
  item,
  blocked,
  inline,
  panelRef,
  modeOwnsKeys,
  showingBackupDiff,
  onLeaveComparison,
  leave,
  onClose,
  onPrevious,
  onNext,
  onGoTo,
  flushPendingSave,
  onFocusCaptionOf,
  onDelete,
  onMove,
  onToggleSelect,
}: GalleryItemKeysOptions) {
  const notify = useNotify();

  useEffect(() => {
    // Wraps and skips the open item; -1 when no other item matches.
    const jumpTo = (kind: ReviewJump, direction: 1 | -1) => {
      const target = nextIndexWhere(items, index, REVIEW_JUMPS[kind].matches, direction);
      if (target < 0 || !onGoTo) {
        notify({ variant: "warning", message: REVIEW_JUMPS[kind].none });
        return -1;
      }
      void leave(() => onGoTo(target));
      return target;
    };
    const fromCaptionEditor = (event: KeyboardEvent) =>
      event.target instanceof Element && event.target.closest(".code-editor--caption") !== null;
    // Review keys: plain letters, never while typing or while an editor owns the keyboard.
    const handleReviewKey = (event: KeyboardEvent) => {
      if (modeOwnsKeys || !item) return false;
      const jump = matchesShortcut(event, SHORTCUTS.nextUncaptioned)
        ? "uncaptioned"
        : matchesShortcut(event, SHORTCUTS.nextIssue)
          ? "issue"
          : null;
      if (jump) {
        event.preventDefault();
        jumpTo(jump, event.shiftKey ? -1 : 1);
        return true;
      }
      if (onMove && matchesShortcut(event, SHORTCUTS.moveItem)) {
        event.preventDefault();
        void leave(onMove);
        return true;
      }
      if (onToggleSelect && matchesShortcut(event, SHORTCUTS.toggleSelectItem)) {
        event.preventDefault();
        onToggleSelect(item.path);
        return true;
      }
      return false;
    };
    const goToStep = (step: NonNullable<ReturnType<typeof queueStepFor>>) => {
      if (items.length < 2) return;
      if (step === "previous") void leave(onPrevious);
      else if (step === "next") void leave(onNext);
      else {
        const target = queueIndexAfter(step, index, items.length);
        if (onGoTo && target !== index) void leave(() => onGoTo(target));
      }
    };
    // Escape leaves the backup comparison first; edit and frame modes take it before that.
    const leavesComparison = (event: KeyboardEvent) => {
      if (!showingBackupDiff || modeOwnsKeys) return false;
      if (!matchesShortcut(event, SHORTCUTS.close)) return false;
      event.preventDefault();
      onLeaveComparison();
      return true;
    };
    const handleKey = (event: KeyboardEvent) => {
      if (blocked) return;
      const outside =
        inline && (!(event.target instanceof Node) || !panelRef.current?.contains(event.target));
      // Docked, only closing and paging pass the panel; focus stays on the card.
      if (outside) {
        const target = event.target instanceof Element ? event.target : null;
        if (
          event.defaultPrevented ||
          getScrollLockDepth() > 0 ||
          isEditableTarget(event) ||
          target?.closest(OUTSIDE_ARROW_OWNERS)
        )
          return;
        if (leavesComparison(event)) return;
        if (matchesShortcut(event, SHORTCUTS.close)) {
          event.preventDefault();
          onClose();
          return;
        }
        if (handleReviewKey(event)) return;
        const step = queueStepFor(event);
        if (!step) return;
        event.preventDefault();
        goToStep(step);
        return;
      }

      // First: the caption editor, where this gets pressed, has already prevented the default.
      if (matchesShortcut(event, SHORTCUTS.saveAndNext)) {
        event.preventDefault();
        if (items.length < 2) {
          void flushPendingSave();
          return;
        }
        if (fromCaptionEditor(event)) onFocusCaptionOf(items[(index + 1) % items.length].path);
        void leave(onNext);
        return;
      }
      if (matchesShortcut(event, SHORTCUTS.saveAndNextUncaptioned)) {
        event.preventDefault();
        const target = jumpTo("uncaptioned", 1);
        if (target < 0) void flushPendingSave();
        else if (fromCaptionEditor(event)) onFocusCaptionOf(items[target].path);
        return;
      }
      // A mask surface claims arrows and Delete by preventing the default.
      if (event.defaultPrevented) return;
      if (leavesComparison(event)) return;
      if (inline && matchesShortcut(event, SHORTCUTS.close) && getScrollLockDepth() === 0) {
        event.preventDefault();
        onClose();
        return;
      }
      // A focused scrubber is exempt via isEditableTarget so arrows still step frames.
      if (isEditableTarget(event)) return;

      if (matchesShortcut(event, SHORTCUTS.deleteItem)) {
        if (modeOwnsKeys) return;
        event.preventDefault();
        onDelete();
        return;
      }
      if (handleReviewKey(event)) return;

      const step = queueStepFor(event);
      if (!step) return;
      event.preventDefault();
      goToStep(step);
    };

    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [
    blocked,
    flushPendingSave,
    index,
    inline,
    item,
    items,
    leave,
    modeOwnsKeys,
    notify,
    onClose,
    onDelete,
    onFocusCaptionOf,
    onGoTo,
    onLeaveComparison,
    onMove,
    onNext,
    onPrevious,
    onToggleSelect,
    panelRef,
    showingBackupDiff,
  ]);
}
