import { useCallback, useRef, useState } from "react";
import type { WorkspaceAction } from "@/app/hooks/useWorkspaceTransitions";

interface SaveBeforeLeaveOptions {
  unsavedChanges: boolean;
  flushPendingSave: () => Promise<boolean>;
  retrySave: () => Promise<boolean>;
  overwriteCaption: () => Promise<boolean>;
  /** The caption changed elsewhere, so the retry overwrites it instead. */
  conflict: boolean;
  saving: boolean;
  discardCaptionChanges: () => void;
}

/**
 * Saves the caption before an action that leaves it; a failed save parks the action. The
 * caller refuses while other work runs, which includes `leaving`.
 */
export function useSaveBeforeLeave({
  unsavedChanges,
  flushPendingSave,
  retrySave,
  overwriteCaption,
  conflict,
  saving,
  discardCaptionChanges,
}: SaveBeforeLeaveOptions) {
  const [leaving, setLeaving] = useState(false);
  const leavingRef = useRef(false);
  const pendingActionRef = useRef<WorkspaceAction | null>(null);
  const [failed, setFailed] = useState(false);

  const flushAndLeave = useCallback(
    async (action: WorkspaceAction) => {
      if (leavingRef.current) return;
      if (!unsavedChanges) {
        await action();
        return;
      }
      leavingRef.current = true;
      setLeaving(true);
      const saved = await flushPendingSave();
      leavingRef.current = false;
      setLeaving(false);
      if (!saved) {
        pendingActionRef.current = action;
        setFailed(true);
        return;
      }
      pendingActionRef.current = null;
      setFailed(false);
      await action();
    },
    [flushPendingSave, unsavedChanges],
  );

  /** Saves again, then hands the parked action to `resume`, which runs the leave's checks. */
  const retryAndContinue = async (resume: (action: WorkspaceAction) => Promise<void>) => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    const saved = await (conflict ? overwriteCaption() : retrySave());
    leavingRef.current = false;
    setLeaving(false);
    if (saved) {
      const action = pendingActionRef.current;
      if (action) await resume(action);
    }
  };

  const discardAndContinue = () => {
    if (saving) return;
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    discardCaptionChanges();
    setFailed(false);
    void action?.();
  };

  const keepEditing = () => {
    pendingActionRef.current = null;
    setFailed(false);
  };

  return { leaving, failed, flushAndLeave, retryAndContinue, discardAndContinue, keepEditing };
}
