import { useCallback, useRef, useState, type RefObject } from "react";
import { formatApiError } from "@/shared/api/http";
import { useOptionalServerEvent } from "@/shared/events/serverEvents";
import { useNotify } from "@/shared/notifications/notifications";
import { replacedExternallyMessage } from "@/features/gallery/lib/mediaActionMessages";
import type { GalleryItem } from "@/shared/types";
import { useLatestRef } from "@/shared/hooks/useLatestRef";
import { useChanged } from "@/shared/hooks/useChanged";
import { useMountedRef } from "@/shared/hooks/useMountedRef";

export interface EditRunOptions {
  item: GalleryItem | undefined;
  onEdited?: () => void | Promise<void>;
  /** The saved spec has seeded the draft; a run before then would write a draft missing it. */
  ready: boolean;
  /** A server-side render whose events of this type report its progress. */
  progressEvent?: "video_edit" | "audio_edit";
  /** Runs right before the request, such as pausing playback. */
  beforeRun?: () => void;
}

export interface EditResult {
  has_backup: boolean;
  replaced_externally: boolean;
}

export interface EditRun {
  applying: boolean;
  /** Null when the output length could not be predicted. */
  progress: number | null;
  hasBackup: boolean;
  setHasBackup: (hasBackup: boolean) => void;
  /** Set as a run starts, so a double click or a shortcut cannot start a second one. */
  applyingRef: RefObject<boolean>;
  mountedRef: RefObject<boolean>;
  /** `settle` records what is now on disk so Apply stays quiet until the next change. */
  run: (
    request: (path: string) => Promise<EditResult>,
    describe: (name: string) => string,
    settle: () => void,
  ) => void;
}

/** The apply and revert round trip the gallery's edit hooks share. */
export function useEditRun(options: EditRunOptions): EditRun {
  const notify = useNotify();
  // An apply outliving an item swap keeps its starting values.
  const optionsRef = useLatestRef(options);
  const mountedRef = useMountedRef();
  const applyingRef = useRef(false);
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [hasBackup, setHasBackup] = useState(false);

  // Separate from the editor's reset so a listing that learns about a backup keeps the draft.
  const { item } = options;
  const pathChanged = useChanged(item?.path);
  const listedBackupChanged = useChanged(item?.has_backup);
  if (pathChanged || listedBackupChanged) setHasBackup(item?.has_backup ?? false);

  useOptionalServerEvent((event) => {
    const { progressEvent, item: current } = optionsRef.current;
    if (!progressEvent || event.type !== progressEvent) return;
    if (!current || event.path !== current.path) return;
    setProgress(
      event.duration && event.duration > 0
        ? Math.min(1, Math.max(0, event.seconds / event.duration))
        : null,
    );
  });

  const run = useCallback<EditRun["run"]>(
    (request, describe, settle) => {
      const { item: currentItem, ready, beforeRun, onEdited } = optionsRef.current;
      if (applyingRef.current || !ready || !currentItem) return;

      // Snapshotted so an item swap mid-render cannot retarget the write.
      const mediaPath = currentItem.path;
      const name = currentItem.name;

      beforeRun?.();
      applyingRef.current = true;
      setApplying(true);
      setProgress(null);

      void (async () => {
        try {
          const result = await request(mediaPath);
          if (mountedRef.current) setHasBackup(result.has_backup);
          notify({ variant: "success", message: describe(name) });
          if (result.replaced_externally) {
            notify({ variant: "warning", message: replacedExternallyMessage(name) });
          }
          await onEdited?.();
          if (mountedRef.current) settle();
        } catch (error) {
          // Unguarded by mountedRef: the store outlives this dialog, so a finish after close reports.
          notify({
            variant: "danger",
            message: `Could not edit ${name}: ${formatApiError(error)}`,
          });
        } finally {
          applyingRef.current = false;
          if (mountedRef.current) {
            setApplying(false);
            setProgress(null);
          }
        }
      })();
    },
    [mountedRef, notify, optionsRef],
  );

  return { applying, progress, hasBackup, setHasBackup, applyingRef, mountedRef, run };
}
