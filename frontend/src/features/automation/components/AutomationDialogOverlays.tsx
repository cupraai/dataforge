import { AutoAdjustDialog } from "./AutoAdjustDialog";
import { AutoCaptionDialog } from "./AutoCaptionDialog";
import { BackupCaptionsDialog } from "./BackupCaptionsDialog";
import { SetCaptionsDialog } from "./SetCaptionsDialog";
import { ReplaceCaptionsDialog } from "./ReplaceCaptionsDialog";
import { EditCaptionsDialog } from "./EditCaptionsDialog";
import { FindDuplicatesDialog } from "./FindDuplicatesDialog";
import { BatchRenameDialog } from "./BatchRenameDialog";
import { CheckCaptionRulesDialog } from "./CheckCaptionRulesDialog";
import { ComfyShowcaseDialog } from "./ComfyShowcaseDialog";
import { ComfyRunDialog } from "./ComfyRunDialog";
import { TrainLoraDialog } from "./TrainLoraDialog";
import { VerifyCaptionsDialog } from "./VerifyCaptionsDialog";
import { ResizeDialog } from "./ResizeDialog";
import { SplitVideoDialog } from "./SplitVideoDialog";
import { TrimVideoDialog } from "./TrimVideoDialog";
import { RestoreCaptionsDialog } from "./RestoreCaptionsDialog";
import { WatermarkDialog } from "./WatermarkDialog";
import type { AutomationDialogsState } from "@/features/automation/types";

type AutomationDialogOverlaysProps = {
  dialogs: AutomationDialogsState;
};

export function AutomationDialogOverlays({ dialogs }: AutomationDialogOverlaysProps) {
  const {
    setCaptions,
    replaceCaptions,
    backupCaptions,
    autoCaption,
    verifyCaptions,
    editCaptions,
    findDuplicates,
    batchRename,
    trainLora,
    watermark,
    comfyRun,
    comfyShowcase,
    resize,
    splitVideo,
    trimVideo,
    autoAdjust,
    checkCaptionRules,
    restoreCaptions,
  } = dialogs;

  return (
    <>
      {setCaptions.open && <SetCaptionsDialog {...setCaptions} />}
      {replaceCaptions.open && <ReplaceCaptionsDialog {...replaceCaptions} />}
      {backupCaptions.open && <BackupCaptionsDialog {...backupCaptions} />}
      {autoCaption.open && <AutoCaptionDialog {...autoCaption} />}
      {verifyCaptions.open && <VerifyCaptionsDialog {...verifyCaptions} />}
      {editCaptions.open && <EditCaptionsDialog {...editCaptions} />}
      {findDuplicates.open && <FindDuplicatesDialog {...findDuplicates} />}
      {batchRename.open && <BatchRenameDialog {...batchRename} />}
      {trainLora.open && <TrainLoraDialog {...trainLora} />}
      {watermark.open && <WatermarkDialog {...watermark} />}
      {comfyRun.open && <ComfyRunDialog {...comfyRun} />}
      {comfyShowcase.open && <ComfyShowcaseDialog {...comfyShowcase} />}
      {resize.open && <ResizeDialog {...resize} />}
      {splitVideo.open && <SplitVideoDialog {...splitVideo} />}
      {trimVideo.open && <TrimVideoDialog {...trimVideo} />}
      {autoAdjust.open && <AutoAdjustDialog {...autoAdjust} />}
      {checkCaptionRules.open && <CheckCaptionRulesDialog {...checkCaptionRules} />}
      {restoreCaptions.open && <RestoreCaptionsDialog {...restoreCaptions} />}
    </>
  );
}
