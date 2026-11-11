import { AutoAdjustDialog } from "./AutoAdjustDialog";
import { AutoCaptionDialog } from "./AutoCaptionDialog";
import { BackupCaptionsDialog } from "./BackupCaptionsDialog";
import { SetCaptionsDialog } from "./SetCaptionsDialog";
import { ReplaceCaptionsDialog } from "./ReplaceCaptionsDialog";
import { EditCaptionsDialog } from "./EditCaptionsDialog";
import { FindDuplicatesDialog } from "./FindDuplicatesDialog";
import { BatchRenameDialog } from "./BatchRenameDialog";
import { CheckCaptionRulesDialog } from "./CheckCaptionRulesDialog";
import { ComfyProcessDialog } from "./ComfyProcessDialog";
import { TrainLoraDialog } from "./TrainLoraDialog";
import { VerifyCaptionsDialog } from "./VerifyCaptionsDialog";
import { ResizeDialog } from "./ResizeDialog";
import { SplitVideoDialog } from "./SplitVideoDialog";
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
    resize,
    splitVideo,
    comfyProcess,
    autoAdjust,
    checkCaptionRules,
    restoreCaptions,
  } = dialogs;

  return (
    <>
      {setCaptions.open && setCaptions.initialSettings && (
        <SetCaptionsDialog
          scope={setCaptions.scope}
          initialSettings={setCaptions.initialSettings}
          busy={setCaptions.busy}
          confirmLabel={setCaptions.confirmLabel}
          onConfirm={setCaptions.onConfirm}
          onCancel={setCaptions.onCancel}
        />
      )}

      {replaceCaptions.open && replaceCaptions.folderPath && replaceCaptions.initialSettings && (
        <ReplaceCaptionsDialog
          scope={replaceCaptions.scope}
          initialSettings={replaceCaptions.initialSettings}
          folderPath={replaceCaptions.folderPath}
          selectedPaths={replaceCaptions.selectedPaths}
          busy={replaceCaptions.busy}
          confirmLabel={replaceCaptions.confirmLabel}
          onConfirm={replaceCaptions.onConfirm}
          onCancel={replaceCaptions.onCancel}
        />
      )}

      {backupCaptions.open && backupCaptions.initialSettings && (
        <BackupCaptionsDialog
          scope={backupCaptions.scope}
          initialSettings={backupCaptions.initialSettings}
          busy={backupCaptions.busy}
          confirmLabel={backupCaptions.confirmLabel}
          onConfirm={backupCaptions.onConfirm}
          onCancel={backupCaptions.onCancel}
        />
      )}

      {autoCaption.open && autoCaption.folderPath && autoCaption.initialSettings && (
        <AutoCaptionDialog
          scope={autoCaption.scope}
          folderPath={autoCaption.folderPath}
          selectedPaths={autoCaption.selectedPaths}
          initialSettings={autoCaption.initialSettings}
          busy={autoCaption.busy}
          editingStep={autoCaption.editingStep}
          confirmLabel={autoCaption.confirmLabel}
          onConfirm={autoCaption.onConfirm}
          onCancel={autoCaption.onCancel}
        />
      )}

      {verifyCaptions.open && verifyCaptions.initialSettings && (
        <VerifyCaptionsDialog
          scope={verifyCaptions.scope}
          initialSettings={verifyCaptions.initialSettings}
          busy={verifyCaptions.busy}
          confirmLabel={verifyCaptions.confirmLabel}
          onConfirm={verifyCaptions.onConfirm}
          onCancel={verifyCaptions.onCancel}
        />
      )}

      {editCaptions.open && editCaptions.initialSettings && (
        <EditCaptionsDialog
          scope={editCaptions.scope}
          folderPath={editCaptions.folderPath}
          selectedPaths={editCaptions.selectedPaths}
          initialSettings={editCaptions.initialSettings}
          busy={editCaptions.busy}
          confirmLabel={editCaptions.confirmLabel}
          onConfirm={editCaptions.onConfirm}
          onCancel={editCaptions.onCancel}
        />
      )}

      {findDuplicates.open && findDuplicates.initialSettings && (
        <FindDuplicatesDialog
          scope={findDuplicates.scope}
          initialSettings={findDuplicates.initialSettings}
          busy={findDuplicates.busy}
          confirmLabel={findDuplicates.confirmLabel}
          onConfirm={findDuplicates.onConfirm}
          onCancel={findDuplicates.onCancel}
        />
      )}

      {batchRename.open && batchRename.initialSettings && (
        <BatchRenameDialog
          scope={batchRename.scope}
          initialSettings={batchRename.initialSettings}
          busy={batchRename.busy}
          confirmLabel={batchRename.confirmLabel}
          onConfirm={batchRename.onConfirm}
          onCancel={batchRename.onCancel}
        />
      )}

      {trainLora.open && trainLora.initialSettings && (
        <TrainLoraDialog
          scope={trainLora.scope}
          initialSettings={trainLora.initialSettings}
          busy={trainLora.busy}
          onConfirm={trainLora.onConfirm}
          onCancel={trainLora.onCancel}
        />
      )}

      {watermark.open && watermark.initialSettings && (
        <WatermarkDialog
          scope={watermark.scope}
          initialSettings={watermark.initialSettings}
          busy={watermark.busy}
          confirmLabel={watermark.confirmLabel}
          onConfirm={watermark.onConfirm}
          onCancel={watermark.onCancel}
        />
      )}

      {comfyProcess.open && comfyProcess.initialSettings && (
        <ComfyProcessDialog
          scope={comfyProcess.scope}
          initialSettings={comfyProcess.initialSettings}
          busy={comfyProcess.busy}
          confirmLabel={comfyProcess.confirmLabel}
          onConfirm={comfyProcess.onConfirm}
          onCancel={comfyProcess.onCancel}
        />
      )}

      {resize.open && resize.initialSettings && (
        <ResizeDialog
          scope={resize.scope}
          initialSettings={resize.initialSettings}
          busy={resize.busy}
          confirmLabel={resize.confirmLabel}
          onConfirm={resize.onConfirm}
          onCancel={resize.onCancel}
        />
      )}

      {splitVideo.open && splitVideo.initialSettings && (
        <SplitVideoDialog
          scope={splitVideo.scope}
          initialSettings={splitVideo.initialSettings}
          busy={splitVideo.busy}
          confirmLabel={splitVideo.confirmLabel}
          onConfirm={splitVideo.onConfirm}
          onCancel={splitVideo.onCancel}
        />
      )}

      {autoAdjust.open && (
        <AutoAdjustDialog
          scope={autoAdjust.scope}
          initialSettings={autoAdjust.initialSettings}
          busy={autoAdjust.busy}
          confirmLabel={autoAdjust.confirmLabel}
          onConfirm={autoAdjust.onConfirm}
          onCancel={autoAdjust.onCancel}
        />
      )}

      {checkCaptionRules.open && (
        <CheckCaptionRulesDialog
          scope={checkCaptionRules.scope}
          folderPath={checkCaptionRules.folderPath}
          busy={checkCaptionRules.busy}
          confirmLabel={checkCaptionRules.confirmLabel}
          onConfirm={checkCaptionRules.onConfirm}
          onCancel={checkCaptionRules.onCancel}
        />
      )}

      {restoreCaptions.open && (
        <RestoreCaptionsDialog
          scope={restoreCaptions.scope}
          folderPath={restoreCaptions.folderPath}
          selectedPaths={restoreCaptions.selectedPaths}
          busy={restoreCaptions.busy}
          confirmLabel={restoreCaptions.confirmLabel}
          onConfirm={restoreCaptions.onConfirm}
          onCancel={restoreCaptions.onCancel}
        />
      )}
    </>
  );
}
