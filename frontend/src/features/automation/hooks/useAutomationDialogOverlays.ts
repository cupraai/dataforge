import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trainLoraBody, type TrainLoraSettings } from "@/features/automation/api/jobs";
import type { ComfyRunSettings } from "@/features/automation/components/ComfyRunDialog";
import type { ReplaceCaptionsSettings } from "@/features/automation/components/ReplaceCaptionsDialog";
import {
  loadAutomationSettings,
  type AutomationSettings,
  type JobSettingsByType,
} from "@/features/automation/preferences/automationPreferences";
import type { AutomationDialogsState, EmbeddedGenerateWorkflow } from "@/features/automation/types";
import { GENERATING_JOBS, MAY_GENERATE_JOBS } from "@/features/jobs/lib/generatingJobs";
import type { JobStartBodies, JobStartBody } from "@/shared/api/jobStartBodies";
import type { DialogScopeInfo } from "@/shared/ui/DialogScope";
import {
  snapshotBulkScope,
  type BulkScopeKind,
  type BulkScopeSnapshot,
} from "@/features/automation/lib/bulkScope";
import type {
  AutoAdjustRunSettings,
  ComfyShowcaseJobSettings,
  DuplicateThreshold,
  GalleryItem,
  EditCaptionsRunSettings,
  JobType,
  TrimVideoRunSettings,
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
  /** The folder's media, for dialogs that pick files themselves. */
  folderItems?: readonly GalleryItem[];
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

/** Jobs the selection cannot narrow: they read the whole folder, or no files at all. */
const FOLDER_WIDE_JOBS: ReadonlySet<JobType> = new Set<JobType>(["train_lora", ...GENERATING_JOBS]);

/** Opens on an empty scope: generating needs none, and the dialog refuses an edit itself. */
const OPENS_WITHOUT_FILES: ReadonlySet<JobType> = new Set<JobType>([
  ...FOLDER_WIDE_JOBS,
  ...MAY_GENERATE_JOBS,
]);

const NO_ITEMS: readonly GalleryItem[] = [];

/** What `openDialogForJobType` can preset: the scope, and a workflow step's own settings. */
export interface DialogOpenOverride extends Partial<BulkScopeSnapshot> {
  /** Shown instead of the folder's remembered settings, in the dialog's own settings shape. */
  initialSettings?: unknown;
  /** Run ComfyUI workflow generates with this file's own workflow instead of a preset. */
  embedded?: EmbeddedGenerateWorkflow;
}

export function useAutomationDialogOverlays({
  folderPath,
  folderLabel,
  queuedAfter,
  startingJobType,
  itemCount,
  folderItemCount,
  folderItems = NO_ITEMS,
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
  const [embedded, setEmbedded] = useState<EmbeddedGenerateWorkflow | undefined>(undefined);
  const [snapshot, setSnapshot] = useState<BulkScopeSnapshot | null>(null);
  const editingStep = stepMode !== undefined;
  const folderRef = useLatestRef(folderPath);
  const openRevisionRef = useRef(0);

  const closeDialog = useCallback(() => {
    setOpenJobType(null);
    setSettings(null);
    setStepSettings(undefined);
    setEmbedded(undefined);
    setSnapshot(null);
    openRevisionRef.current += 1;
  }, []);

  if (useChanged(folderPath)) {
    setOpenJobType(null);
    setSettings(null);
    setEmbedded(undefined);
    setSnapshot(null);
  }
  useEffect(() => {
    openRevisionRef.current += 1;
  }, [folderPath]);

  /** Closes the dialog, then starts its job; a rejection is already reported by the context. */
  const startJobFromDialog = useCallback(
    <T extends JobType>(
      jobType: T,
      body?: JobStartBodies[T],
      folderWide = FOLDER_WIDE_JOBS.has(jobType),
    ) => {
      if (!folderPath || (!editingStep && !folderWide && snapshot?.paths?.length === 0)) return;
      closeDialog();
      startJob(jobType, folderPath, body, folderWide ? undefined : snapshot?.paths).catch(() => {});
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

  const generateScope = useMemo<DialogScopeInfo>(
    () => ({ itemCount: folderItemCount, folderLabel, kind: "destination", queuedAfter }),
    [folderItemCount, folderLabel, queuedAfter],
  );

  const stepNote = stepMode?.note;
  const stepScope = useMemo<DialogScopeInfo>(
    () => (stepNote ? { ...scope, note: stepNote, queuedAfter: undefined } : scope),
    [scope, stepNote],
  );

  const dialogs = useMemo<AutomationDialogsState>(() => {
    const shared = <K extends keyof AutomationSettings & JobType>(jobType: K) => {
      const base = {
        scope: stepScope,
        busy: startingJobType === jobType,
        confirmLabel: stepMode?.confirmLabel,
        onCancel: closeDialog,
      };
      return openJobType === jobType && settings !== null
        ? {
            ...base,
            open: true as const,
            // Every dialog starts from its last run's settings; a workflow step brings its own.
            initialSettings:
              (stepSettings as AutomationSettings[K] | undefined) ?? settings[jobType],
          }
        : { ...base, open: false as const, initialSettings: null };
    };

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
        editingStep,
        folderPath: folderPath ?? "",
        onConfirm: (settings: JobSettingsByType["verify_captions"]) =>
          startJobFromDialog("verify_captions", settings),
      },
      editCaptions: {
        ...shared("edit_captions"),
        editingStep,
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
      comfyRun: {
        ...shared("comfy_run"),
        destinationScope: generateScope,
        editOnly: editingStep,
        embedded,
        folderItems,
        onConfirm: (draft: ComfyRunSettings) => {
          const edit = {
            // A file's own workflow has no preset; its stem only names it in the dialog.
            preset: embedded ? "" : draft.preset,
            seed: draft.seed,
            prompt_text: draft.promptText,
            inputs: draft.inputs,
            overwrite_candidates: draft.overwriteCandidates,
          };
          // A step keeps exactly what it runs with; a job sends the rest so it is remembered.
          startJobFromDialog(
            "comfy_run",
            editingStep
              ? edit
              : {
                  ...edit,
                  ...(embedded && {
                    source: { path: embedded.mediaPath, node_id: embedded.nodeId },
                  }),
                  mode: draft.mode,
                  start_path: draft.startPath,
                  count: draft.count,
                  name_prefix: draft.namePrefix,
                  caption_from_prompt: draft.captionFromPrompt,
                },
            draft.generates,
          );
        },
      },
      comfyShowcase: {
        ...shared("comfy_showcase"),
        scope: generateScope,
        folderPath: folderPath ?? "",
        folderItems,
        // Stays open until the job is accepted: a refusal must not cost a list of prompts.
        onConfirm: (body: ComfyShowcaseJobSettings) => {
          if (!folderPath) return;
          void startJob("comfy_showcase", folderPath, body).then((job) => {
            if (job) closeDialog();
          });
        },
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
      trimVideo: {
        ...shared("trim_video"),
        onConfirm: (settings: TrimVideoRunSettings) => startJobFromDialog("trim_video", settings),
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
        // A workflow step only describes a restore; it writes nothing while it is edited.
        canRestoreOne: !editingStep,
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
    startJob,
    startJobFromDialog,
    startingJobType,
    stepMode?.confirmLabel,
    stepScope,
    stepSettings,
    trainLoraScope,
    generateScope,
    embedded,
    snapshot,
    folderItems,
  ]);

  /** Shows a job type's dialog, loading this folder's saved settings first. */
  const openDialogForJobType = useCallback(
    (jobType: JobType, override?: DialogOpenOverride) => {
      if (!folderPath) return;
      const paths = override?.paths ?? getJobPaths?.();
      if (!editingStep && !OPENS_WITHOUT_FILES.has(jobType) && paths?.length === 0) return;
      setSnapshot(
        snapshotBulkScope(override?.scope ?? { itemCount, folderLabel, kind: scopeKind }, paths),
      );
      const revision = ++openRevisionRef.current;
      void (async () => {
        const loaded = await loadAutomationSettings(folderPath, queryClient);
        if (folderRef.current !== folderPath || revision !== openRevisionRef.current) return;
        setSettings(loaded);
        setStepSettings(override?.initialSettings);
        setEmbedded(override?.embedded);
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
