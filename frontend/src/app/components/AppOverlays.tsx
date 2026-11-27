import { AutomationDialogOverlays } from "@/features/automation/components/AutomationDialogOverlays";
import { WorkflowOverlays } from "@/features/workflows/components/WorkflowOverlays";
import { CreateFolderDialog } from "@/features/folder/components/CreateFolderDialog";
import { FileImportOverwriteDialog } from "@/features/folder/components/FileImportOverwriteDialog";
import { QuickActionDialog } from "@/features/quickAction/components/QuickActionDialog";
import { FileRenameDialog } from "@/features/gallery/components/FileRenameDialog";
import { GalleryItemDialog } from "@/features/gallery/components/GalleryItemDialog";
import { useGallerySelectionContext } from "@/features/gallery/context/GallerySelectionContext";
import { IssueResolverDialog } from "@/features/gallery/components/IssueResolverDialog";
import { JOB_START_CONFIRM, jobTypeIconFor } from "@/features/jobs/lib/jobMeta";
import { JobsDialog } from "@/features/jobs/components/JobsDialog";
import { DuplicateResolverDialog } from "@/features/gallery/components/DuplicateResolverDialog";
import { CandidateReviewDialog } from "@/features/gallery/components/CandidateReviewDialog";
import { FolderInstructionsDialog } from "@/features/gallery/components/FolderInstructionsDialog";
import { SelectionActionOverlays } from "@/features/gallery/components/SelectionActionOverlays";
import { SidecarSweepDialog } from "@/features/gallery/components/SidecarSweepDialog";
import { SettleAllCandidatesDialog } from "@/features/gallery/components/SettleAllCandidatesDialog";
import { StatsDialog } from "@/features/gallery/components/StatsDialog";
import { SettingsDialog } from "@/features/settings/components/SettingsDialog";
import { ShortcutsDialog } from "@/features/shortcuts/components/ShortcutsDialog";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { RenameDialog } from "@/shared/ui/RenameDialog";
import type { AppOverlaysProps } from "./overlays";
import { trashName } from "@/shared/lib/platform";

export function AppOverlays({
  currentJobActions,
  currentFolder,
  onOpenFolder,
  quickAction,
  selectionActions,
  renameFile,
  sidecarSweep,
  settleAllCandidates,
  onCaptionSaved,
  gallery,
  issueResolver,
  instructions,
  stats,
  duplicateResolver,
  candidateReview,
  jobStart,
  automation,
  workflows,
  fileImport,
  createFolder,
  renameFolder,
  deleteFolder,
  settings,
  shortcuts,
}: AppOverlaysProps) {
  const { selectedPaths, toggleSelectedPath } = useGallerySelectionContext();

  return (
    <>
      <JobsDialog
        currentFolder={currentFolder}
        onOpenFolder={onOpenFolder}
        currentActions={currentJobActions}
      />

      <StatsDialog {...stats} />

      <SelectionActionOverlays {...selectionActions} />

      {renameFile && (
        <FileRenameDialog
          fileName={renameFile.fileName}
          busy={renameFile.busy}
          error={renameFile.error}
          onConfirm={(name) => {
            void renameFile.onConfirm(name);
          }}
          onCancel={renameFile.onCancel}
        />
      )}

      <SidecarSweepDialog {...sidecarSweep} />

      <SettleAllCandidatesDialog {...settleAllCandidates} />

      {quickAction.open && (
        <QuickActionDialog
          items={quickAction.items}
          recentItems={quickAction.recentItems}
          onClose={quickAction.close}
        />
      )}

      {issueResolver.open && issueResolver.items.length > 0 && (
        <IssueResolverDialog {...issueResolver} onCaptionSaved={onCaptionSaved} />
      )}

      {duplicateResolver.open && duplicateResolver.groups.length > 0 && (
        <DuplicateResolverDialog {...duplicateResolver} />
      )}

      {candidateReview.open && candidateReview.entries.length > 0 && (
        <CandidateReviewDialog {...candidateReview} />
      )}

      {gallery.selectedPath && gallery.index >= 0 && (
        <GalleryItemDialog
          {...gallery}
          suspended={instructions.open || gallery.suspended}
          currentFolder={currentFolder}
          onCaptionSaved={onCaptionSaved}
          selected={selectedPaths.has(gallery.selectedPath)}
          onToggleSelect={toggleSelectedPath}
        />
      )}

      {instructions.open && instructions.folderPath && (
        <FolderInstructionsDialog
          key={instructions.folderPath}
          folderPath={instructions.folderPath}
          initialTab={instructions.tab}
          onClose={instructions.onClose}
          onSaved={instructions.onSaved}
        />
      )}

      {jobStart.pending && (
        <ConfirmDialog
          title={JOB_START_CONFIRM[jobStart.pending].title}
          icon={jobTypeIconFor(jobStart.pending)}
          scope={jobStart.scope}
          description={JOB_START_CONFIRM[jobStart.pending].description()}
          confirmLabel={JOB_START_CONFIRM[jobStart.pending].confirmLabel}
          onConfirm={jobStart.onConfirm}
          onCancel={jobStart.onCancel}
        />
      )}

      <AutomationDialogOverlays dialogs={automation} />

      <WorkflowOverlays state={workflows} />

      {fileImport && <FileImportOverwriteDialog {...fileImport} />}

      {createFolder && <CreateFolderDialog {...createFolder} />}

      {renameFolder && (
        <RenameDialog
          title="Rename folder"
          description={
            <>
              Give the empty folder <strong>{renameFolder.folderName}</strong> another name.
            </>
          }
          fieldLabel="Folder name"
          initialName={renameFolder.folderName}
          busy={renameFolder.busy}
          error={renameFolder.error}
          onConfirm={renameFolder.onConfirm}
          onCancel={renameFolder.onCancel}
        />
      )}

      {deleteFolder && (
        <ConfirmDialog
          title="Delete this folder?"
          description={
            <>
              <strong>{deleteFolder.folderLabel}</strong> is empty. It goes to the {trashName()}.
            </>
          }
          confirmLabel={deleteFolder.busy ? "Deleting..." : "Delete"}
          confirmVariant="danger"
          busy={deleteFolder.busy}
          onConfirm={() => {
            void deleteFolder.onConfirm();
          }}
          onCancel={deleteFolder.onCancel}
        />
      )}

      {settings.open && <SettingsDialog onClose={settings.close} />}
      {shortcuts.open && <ShortcutsDialog onClose={shortcuts.close} />}
    </>
  );
}
