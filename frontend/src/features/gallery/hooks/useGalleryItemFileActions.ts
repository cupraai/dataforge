import { useCallback, useState } from "react";
import { deleteMedia, openMediaInViewer, renameMedia } from "@/features/gallery/api/media";
import { transcodeVideo } from "@/features/gallery/api/videoEdit";
import { useDeleteLeftoversNotice } from "@/features/gallery/hooks/useDeleteLeftoversNotice";
import { useDeleteUndoNotice } from "@/features/gallery/hooks/useDeleteUndoNotice";
import { formatApiError } from "@/shared/api/http";
import { useChanged } from "@/shared/hooks/useChanged";
import { useNotify } from "@/shared/notifications/notifications";
import type { GalleryItem } from "@/shared/types";

interface GalleryItemFileActionsOptions {
  item: GalleryItem | undefined;
  /** Other work in the dialog; any of it, or one of these actions, blocks starting another. */
  busyElsewhere: boolean;
  flushPendingSave: (force?: boolean) => Promise<boolean>;
  onDeleted?: (path: string) => void;
  onRenamed?: (path: string, renamedPath: string) => void;
  /** Refreshes the folder. */
  onCopied?: () => void | Promise<void>;
}

/** Delete, rename, open in the system viewer and convert to H.264, for the open file. */
export function useGalleryItemFileActions({
  item,
  busyElsewhere,
  flushPendingSave,
  onDeleted,
  onRenamed,
  onCopied,
}: GalleryItemFileActionsOptions) {
  const notify = useNotify();
  const notifyDeleteLeftovers = useDeleteLeftoversNotice();
  const notifyDeleteUndo = useDeleteUndoNotice();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [openingInViewer, setOpeningInViewer] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const busy = busyElsewhere || deleting || renaming || converting;

  if (useChanged(item?.path)) {
    setDeleteConfirmOpen(false);
    setDeleting(false);
    setRenameOpen(false);
    setRenaming(false);
    setRenameError(null);
    setOpeningInViewer(false);
    setViewerError(null);
  }

  const openDeleteConfirm = useCallback(() => {
    if (busy) return;
    setDeleteConfirmOpen(true);
  }, [busy]);

  const cancelDeleteConfirm = useCallback(() => {
    if (deleting) return;
    setDeleteConfirmOpen(false);
  }, [deleting]);

  const confirmDelete = useCallback(async () => {
    if (!item || deleting) return;

    setDeleting(true);
    if (!(await flushPendingSave())) {
      setDeleting(false);
      setDeleteConfirmOpen(false);
      return;
    }

    try {
      const result = await deleteMedia(item.path);
      setDeleteConfirmOpen(false);
      onDeleted?.(item.path);
      notifyDeleteLeftovers([result]);
      // onCopied refreshes the folder, which is all a restored file needs to show up again.
      notifyDeleteUndo([result], () => onCopied?.());
    } catch (error) {
      setDeleteConfirmOpen(false);
      notify({
        variant: "danger",
        message: `Could not delete ${item.name}: ${formatApiError(error)}`,
      });
    } finally {
      setDeleting(false);
    }
  }, [
    deleting,
    flushPendingSave,
    item,
    notify,
    notifyDeleteLeftovers,
    notifyDeleteUndo,
    onCopied,
    onDeleted,
  ]);

  const openRename = useCallback(() => {
    if (busy) return;
    setRenameError(null);
    setRenameOpen(true);
  }, [busy]);

  const cancelRename = useCallback(() => {
    if (renaming) return;
    setRenameOpen(false);
    setRenameError(null);
  }, [renaming]);

  /** The rename itself; the dialog runs it behind its unsaved-edits check. */
  const rename = useCallback(
    async (name: string) => {
      if (!item || renaming) return;

      setRenaming(true);
      setRenameError(null);
      // A caption saved after the rename would write a file under the old name.
      if (!(await flushPendingSave(true))) {
        setRenaming(false);
        setRenameError("The caption could not be saved. Try renaming again to retry the save.");
        return;
      }

      try {
        const result = await renameMedia(item.path, name);
        setRenameOpen(false);
        onRenamed?.(item.path, result.destination);
      } catch (error) {
        setRenameError(formatApiError(error));
      } finally {
        setRenaming(false);
      }
    },
    [flushPendingSave, item, onRenamed, renaming],
  );

  const openInViewer = useCallback(async () => {
    if (!item || openingInViewer) return;

    setViewerError(null);
    setOpeningInViewer(true);

    try {
      await openMediaInViewer(item.path);
    } catch (error) {
      setViewerError(formatApiError(error));
    } finally {
      setOpeningInViewer(false);
    }
  }, [item, openingInViewer]);

  /** Re-encodes in place through the edit pipeline: Revert original gets the file back. */
  const convertToPlayable = useCallback(async () => {
    if (!item || busy) return;
    setConverting(true);
    try {
      await transcodeVideo(item.path);
      notify({
        variant: "success",
        message: `Converted ${item.name} to H.264. Revert original restores it as it was.`,
      });
      await onCopied?.();
    } catch (error) {
      notify({
        variant: "danger",
        message: `Could not convert ${item.name}: ${formatApiError(error)}`,
      });
    } finally {
      setConverting(false);
    }
  }, [busy, item, notify, onCopied]);

  return {
    deleteConfirmOpen,
    deleting,
    openDeleteConfirm,
    cancelDeleteConfirm,
    confirmDelete,
    renameOpen,
    renaming,
    renameError,
    openRename,
    cancelRename,
    rename,
    openingInViewer,
    viewerError,
    openInViewer,
    converting,
    convertToPlayable,
  };
}
