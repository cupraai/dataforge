import type { ComponentProps } from "react";
import type { AutoAdjustDialog } from "@/features/automation/components/AutoAdjustDialog";
import type { AutoCaptionDialog } from "@/features/automation/components/AutoCaptionDialog";
import type { BackupCaptionsDialog } from "@/features/automation/components/BackupCaptionsDialog";
import type { BatchRenameDialog } from "@/features/automation/components/BatchRenameDialog";
import type { CheckCaptionRulesDialog } from "@/features/automation/components/CheckCaptionRulesDialog";
import type { ComfyRunDialog } from "@/features/automation/components/ComfyRunDialog";
import type { ComfyShowcaseDialog } from "@/features/automation/components/ComfyShowcaseDialog";
import type { EditCaptionsDialog } from "@/features/automation/components/EditCaptionsDialog";
import type { FindDuplicatesDialog } from "@/features/automation/components/FindDuplicatesDialog";
import type { ReplaceCaptionsDialog } from "@/features/automation/components/ReplaceCaptionsDialog";
import type { ResizeDialog } from "@/features/automation/components/ResizeDialog";
import type { RestoreCaptionsDialog } from "@/features/automation/components/RestoreCaptionsDialog";
import type { SetCaptionsDialog } from "@/features/automation/components/SetCaptionsDialog";
import type { SplitVideoDialog } from "@/features/automation/components/SplitVideoDialog";
import type { TrainLoraDialog } from "@/features/automation/components/TrainLoraDialog";
import type { TrimVideoDialog } from "@/features/automation/components/TrimVideoDialog";
import type { VerifyCaptionsDialog } from "@/features/automation/components/VerifyCaptionsDialog";
import type { WatermarkDialog } from "@/features/automation/components/WatermarkDialog";
import type { ComfyEmbeddedGeneration, ComfyOutputBranch } from "@/shared/types";

/** Opens once its settings load, so an open dialog always has them. */
type SettingsDialogSlot<P extends { initialSettings: unknown }> =
  | (P & { open: true })
  | (Omit<P, "initialSettings"> & { open: false; initialSettings: null });

/** A dialog that opens without loaded settings. */
type DialogSlot<P> = P & { open: boolean };

/** Each dialog's props, spread onto it while it is open. */
export type AutomationDialogsState = {
  setCaptions: SettingsDialogSlot<ComponentProps<typeof SetCaptionsDialog>>;
  replaceCaptions: SettingsDialogSlot<ComponentProps<typeof ReplaceCaptionsDialog>>;
  backupCaptions: SettingsDialogSlot<ComponentProps<typeof BackupCaptionsDialog>>;
  autoCaption: SettingsDialogSlot<ComponentProps<typeof AutoCaptionDialog>>;
  verifyCaptions: SettingsDialogSlot<ComponentProps<typeof VerifyCaptionsDialog>>;
  editCaptions: SettingsDialogSlot<ComponentProps<typeof EditCaptionsDialog>>;
  findDuplicates: SettingsDialogSlot<ComponentProps<typeof FindDuplicatesDialog>>;
  batchRename: SettingsDialogSlot<ComponentProps<typeof BatchRenameDialog>>;
  trainLora: SettingsDialogSlot<ComponentProps<typeof TrainLoraDialog>>;
  watermark: SettingsDialogSlot<ComponentProps<typeof WatermarkDialog>>;
  comfyRun: SettingsDialogSlot<ComponentProps<typeof ComfyRunDialog>>;
  comfyShowcase: SettingsDialogSlot<ComponentProps<typeof ComfyShowcaseDialog>>;
  resize: SettingsDialogSlot<ComponentProps<typeof ResizeDialog>>;
  splitVideo: SettingsDialogSlot<ComponentProps<typeof SplitVideoDialog>>;
  trimVideo: SettingsDialogSlot<ComponentProps<typeof TrimVideoDialog>>;
  autoAdjust: DialogSlot<ComponentProps<typeof AutoAdjustDialog>>;
  checkCaptionRules: DialogSlot<ComponentProps<typeof CheckCaptionRulesDialog>>;
  restoreCaptions: DialogSlot<ComponentProps<typeof RestoreCaptionsDialog>>;
};

/** One output of a file's own workflow, handed from the workflow dialog to the run dialog. */
export interface EmbeddedGenerateWorkflow {
  mediaPath: string;
  mediaName: string;
  nodeId: string;
  generation: ComfyEmbeddedGeneration;
  /** Drawn as the map, so the dialog shows what it runs without another request. */
  branch: ComfyOutputBranch;
}
