import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trainLoraBody, type TrainLoraSettings } from "@/features/automation/api/jobs";
import type { ComfyProcessSettings } from "@/features/automation/components/ComfyProcessDialog";
import type { ReplaceCaptionsSettings } from "@/features/automation/components/ReplaceCaptionsDialog";
import {
  loadAutomationSettings,
  type AutomationSettings,
  type JobSettingsByType,
} from "@/features/automation/preferences/automationPreferences";
import type { AutomationDialogsState } from "@/features/automation/types";
import type { JobStartBodies, JobStartBody } from "@/shared/api/jobStartBodies";
import type { DialogScopeInfo } from "@/shared/ui/DialogScope";
import {
  snapshotBulkScope,
  type BulkScopeKind,
  type BulkScopeSnapshot,
} from "@/features/automation/lib/bulkScope";
import type {
  AutoAdjustRunSettings,
  DuplicateThreshold,
  EditCaptionsRunSettings,
  JobType,
  VideoFrameRate,
} from "@/shared/types";
import { useLatestRef } from "@/shared/hooks/useLatestRef";
import { useChanged } from "@/shared/hooks/useChanged";

type UseAutomationDialogOverlaysOptions = {
  folderPath: string | undefined;
  folderLabel: string;
  /** What a job started now waits for; see `DialogScopeInfo.queuedAfter`. */
  queuedAfter?: string;
  startingJobType: JobType | null;
  /** Files a job will touch, before job-specific eligibility checks. */
  itemCount: number;
  /** Every file in the folder, for jobs the selection cannot narrow. */
  folderItemCount: number;
  scopeKind?: BulkScopeKind;
  startJob: (
    jobType: JobType,
    folder: string,
    body?: JobStartBody,
    paths?: string[],
  ) => Promise<unknown>;
  getJobPaths?: () => string[] | undefined;
  /** Edit a workflow step: confirming hands the body to `startJob` under this label. */
  stepMode?: { confirmLabel: string; note: string };
};

/** What `openDialogForJobType` can preset: the scope, and a workflow step's own settings. */
export interface DialogOpenOverride extends Partial<BulkScopeSnapshot> {
  /** Shown instead of the folder's remembered settings, in the dialog's own settings shape. */
  initialSettings?: unknown;
}

export function useAutomationDialogOverlays({
  folderPath,
  folderLabel,
  queuedAfter,
  startingJobType,
  itemCount,
  folderItemCount,
  scopeKind = "folder",
  startJob,
  getJobPaths,
  stepMode,
}: UseAutomationDialogOverlaysOptions) {
  // At most one dialog is ever open, so one job type beats a boolean per dialog.
  const [openJobType, setOpenJobType] = useState<JobType | null>(null);
  // This folder's saved settings, loaded before any dialog opens.
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<AutomationSettings | null>(null);
  const [stepSettings, setStepSettings] = useState<unknown>(undefined);
  const [snapshot, setSnapshot] = useState<BulkScopeSnapshot | null>(null);
  const editingStep = stepMode !== undefined;
  const folderRef = useLatestRef(folderPath);
  const openRevisionRef = useRef(0);

  const closeDialog = useCallback(() => {
    setOpenJobType(null);
    setSettings(null);
    setStepSettings(undefined);
    setSnapshot(null);
    openRevisionRef.current += 1;
  }, []);

  if (useChanged(folderPath)) {
    setOpenJobType(null);
    setSettings(null);
    setSnapshot(null);
  }
  useEffect(() => {
    openRevisionRef.current += 1;
  }, [folderPath]);

  /** Closes the dialog, then starts its job; a rejection is already reported by the context. */
  const startJobFromDialog = useCallback(
    <T extends JobType>(jobType: T, body?: JobStartBodies[T]) => {
      if (
        !folderPath ||
        (!editingStep && jobType !== "train_lora" && snapshot?.paths?.length === 0)
      )
        return;
      closeDialog();
      startJob(
        jobType,
        folderPath,
        body,
        jobType === "train_lora" ? undefined : snapshot?.paths,
      ).catch(() => {});
    },
    [closeDialog, editingStep, folderPath, snapshot, startJob],
  );

  // Live, not snapshotted: the job ahead can finish while the dialog is open.
  const scope = useMemo<DialogScopeInfo>(
    () => ({ ...(snapshot?.scope ?? { itemCount, folderLabel, kind: scopeKind }), queuedAfter }),
    [folderLabel, itemCount, queuedAfter, scopeKind, snapshot],
  );

  const trainLoraScope = useMemo<DialogScopeInfo>(
    () => ({
      itemCount: folderItemCount,
      folderLabel,
      kind: "folder",
      note: "AI-Toolkit trains on the whole folder. Search, filters, and selection do not limit training.",
      queuedAfter,
    }),
    [folderItemCount, folderLabel, queuedAfter],
  );

  const stepNote = stepMode?.note;
  const stepScope = useMemo<DialogScopeInfo>(
    () => (stepNote ? { ...scope, note: stepNote, queuedAfter: undefined } : scope),
    [scope, stepNote],
  );

  const dialogs = useMemo<AutomationDialogsState>(() => {
    const shared = <K extends keyof AutomationSettings & JobType>(jobType: K) => ({
      open: openJobType === jobType,
      scope: stepScope,
      // Every dialog starts from what its last run used, so there is no job type
      // here that reads its settings differently from the rest. A step brings its own.
      initialSettings:
        settings === null
          ? null
          : ((stepSettings as AutomationSettings[K] | undefined) ?? settings[jobType]),
      busy: startingJobType === jobType,
      confirmLabel: stepMode?.confirmLabel,
      onCancel: closeDialog,
    });

    return {
      setCaptions: {
        ...shared("set_captions"),
        onConfirm: (caption: string, overwrite: boolean) =>
          startJobFromDialog("set_captions", { caption, overwrite }),
      },
      replaceCaptions: {
        ...shared("replace_captions"),
        folderPath: folderPath ?? "",
        // The same selection the job will run on, so the preview counts what it edits.
        selectedPaths: snapshot?.paths ?? getJobPaths?.(),
        onConfirm: (edit: ReplaceCaptionsSettings) =>
          startJobFromDialog("replace_captions", {
            mode: edit.mode,
            search: edit.search,
            replacement: edit.replacement,
            use_regex: edit.useRegex,
            case_sensitive: edit.caseSensitive,
            backup: edit.backup,
          }),
      },
      backupCaptions: {
        ...shared("backup_captions"),
        onConfirm: () => startJobFromDialog("backup_captions"),
      },
      autoCaption: {
        ...shared("auto_caption"),
        editingStep,
        folderPath: folderPath ?? "",
        selectedPaths: snapshot?.paths ?? getJobPaths?.(),
        onConfirm: (settings: JobSettingsByType["auto_caption"]) =>
          startJobFromDialog("auto_caption", settings),
      },
      verifyCaptions: {
        ...shared("verify_captions"),
        onConfirm: (settings: JobSettingsByType["verify_captions"]) =>
          startJobFromDialog("verify_captions", settings),
      },
      editCaptions: {
        ...shared("edit_captions"),
        folderPath: folderPath ?? "",
        selectedPaths: snapshot?.paths ?? getJobPaths?.(),
        onConfirm: (settings: EditCaptionsRunSettings) =>
          startJobFromDialog("edit_captions", settings),
      },
      findDuplicates: {
        ...shared("find_duplicates"),
        onConfirm: (threshold: DuplicateThreshold) =>
          startJobFromDialog("find_duplicates", { threshold }),
      },
      batchRename: {
        ...shared("batch_rename"),
        onConfirm: (stem: string, startNumber: number) =>
          startJobFromDialog("batch_rename", { stem, start_number: startNumber }),
      },
      trainLora: {
        ...shared("train_lora"),
        scope: trainLoraScope,
        onConfirm: (draft: TrainLoraSettings) =>
          startJobFromDialog("train_lora", trainLoraBody(draft)),
      },
      watermark: {
        ...shared("watermark"),
        onConfirm: (settings: JobSettingsByType["watermark"]) =>
          startJobFromDialog("watermark", settings),
      },
      comfyProcess: {
        ...shared("comfy_process"),
        onConfirm: (draft: ComfyProcessSettings) =>
          startJobFromDialog("comfy_process", {
            preset: draft.preset,
            seed: draft.seed,
            prompt_text: draft.promptText,
            inputs: draft.inputs,
            overwrite_candidates: draft.overwriteCandidates,
          }),
      },
      resize: {
        ...shared("resize"),
        onConfirm: (
          megapixels: number,
          multiple: number,
          resetSize: boolean,
          frameRate: VideoFrameRate | null,
        ) =>
          startJobFromDialog("resize", {
            megapixels,
            multiple,
            reset_size: resetSize,
            frame_rate: frameRate,
          }),
      },
      splitVideo: {
        ...shared("split_video"),
        onConfirm: (settings: JobSettingsByType["split_video"]) =>
          startJobFromDialog("split_video", settings),
      },
      autoAdjust: {
        open: openJobType === "auto_adjust",
        scope: stepScope,
        busy: startingJobType === "auto_adjust",
        confirmLabel: stepMode?.confirmLabel,
        initialSettings: stepSettings as AutoAdjustRunSettings | undefined,
        onCancel: closeDialog,
        onConfirm: (replaceAdjustments: boolean, resetAdjustments: boolean) =>
          startJobFromDialog("auto_adjust", {
            replace_adjustments: replaceAdjustments,
            reset_adjustments: resetAdjustments,
          }),
      },
      checkCaptionRules: {
        open: openJobType === "check_caption_rules",
        scope: stepScope,
        busy: startingJobType === "check_caption_rules",
        confirmLabel: stepMode?.confirmLabel,
        folderPath: folderPath ?? "",
        onCancel: closeDialog,
        onConfirm: () => startJobFromDialog("check_caption_rules"),
      },
      restoreCaptions: {
        open: openJobType === "restore_captions",
        scope: stepScope,
        busy: startingJobType === "restore_captions",
        confirmLabel: stepMode?.confirmLabel,
        folderPath: folderPath ?? "",
        // The same selection the job will run on, so the preview compares what it restores.
        selectedPaths: snapshot?.paths ?? getJobPaths?.(),
        onCancel: closeDialog,
        onConfirm: () => startJobFromDialog("restore_captions"),
      },
    };
  }, [
    closeDialog,
    editingStep,
    folderPath,
    getJobPaths,
    openJobType,
    settings,
    startJobFromDialog,
    startingJobType,
    stepMode?.confirmLabel,
    stepScope,
    stepSettings,
    trainLoraScope,
    snapshot,
  ]);

  /** Shows a job type's dialog, loading this folder's saved settings first. */
  const openDialogForJobType = useCallback(
    (jobType: JobType, override?: DialogOpenOverride) => {
      if (!folderPath) return;
      const paths = override?.paths ?? getJobPaths?.();
      if (!editingStep && jobType !== "train_lora" && paths?.length === 0) return;
      setSnapshot(
        snapshotBulkScope(override?.scope ?? { itemCount, folderLabel, kind: scopeKind }, paths),
      );
      const revision = ++openRevisionRef.current;
      void (async () => {
        const loaded = await loadAutomationSettings(folderPath, queryClient);
        if (folderRef.current !== folderPath || revision !== openRevisionRef.current) return;
        setSettings(loaded);
        setStepSettings(override?.initialSettings);
        setOpenJobType(jobType);
      })();
    },
    [
      editingStep,
      folderLabel,
      folderPath,
      folderRef,
      getJobPaths,
      itemCount,
      queryClient,
      scopeKind,
    ],
  );

  return { dialogs, openDialogForJobType };
}
