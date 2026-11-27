import type { WorkflowOverlaysState } from "@/features/workflows/hooks/useWorkflowHost";
import type { InstructionKind } from "@/shared/api/folderInstructions";
import type { AutomationDialogsState } from "@/features/automation/types";
import type { ConfirmableJobType } from "@/features/jobs/lib/jobMeta";
import type { SelectionActionOverlaysProps } from "@/features/gallery/components/SelectionActionOverlays";
import type { SidecarSweepDialogProps } from "@/features/gallery/components/SidecarSweepDialog";
import type { DeleteFolderOverlayState } from "@/features/folder/hooks/useDeleteFolderDialog";
import type { RenameFolderOverlayState } from "@/features/folder/hooks/useRenameFolderDialog";
import type { SettleAllCandidatesDialogProps } from "@/features/gallery/components/SettleAllCandidatesDialog";
import type { QuickActionOverlayState } from "@/features/quickAction/hooks/useQuickActionHost";
import type { CaptionSaveResponse, InstructionFileResponse } from "@/shared/types";
import type { DialogScopeInfo } from "@/shared/ui/DialogScope";
import type { ComponentProps } from "react";
import type { CandidateReviewDialog } from "@/features/gallery/components/CandidateReviewDialog";
import type { DuplicateResolverDialog } from "@/features/gallery/components/DuplicateResolverDialog";
import type { GalleryItemDialog } from "@/features/gallery/components/GalleryItemDialog";
import type { IssueResolverDialog } from "@/features/gallery/components/IssueResolverDialog";
import type { StatsDialog } from "@/features/gallery/components/StatsDialog";
import type { CreateFolderDialog } from "@/features/folder/components/CreateFolderDialog";
import type { FileImportOverwriteDialog } from "@/features/folder/components/FileImportOverwriteDialog";
import type { useOpenState } from "@/shared/hooks/useOpenState";
import type { CurrentJobActions } from "@/features/jobs/components/JobsDialog";

type CaptionSavedHandler = (path: string, update: CaptionSaveResponse) => void;

type GalleryOverlayState = Omit<
  ComponentProps<typeof GalleryItemDialog>,
  "currentFolder" | "onCaptionSaved" | "selected" | "onToggleSelect"
> & { selectedPath: string | null };

type InstructionsOverlayState = {
  open: boolean;
  folderPath: string | undefined;
  tab: InstructionKind;
  onClose: () => void;
  onSaved: (kind: InstructionKind, saved: InstructionFileResponse) => void;
};

type PagingOverlayState<Props> = Props & { open: boolean };

type JobStartConfirmState = {
  pending: ConfirmableJobType | null;
  scope: DialogScopeInfo;
  onConfirm: () => void;
  onCancel: () => void;
};

type RenameFileOverlayState = {
  fileName: string;
  busy: boolean;
  error: string | null;
  onConfirm: (name: string) => Promise<void>;
  onCancel: () => void;
};

type OpenOverlayState = Pick<ReturnType<typeof useOpenState>, "open" | "close">;

export type AppOverlaysProps = {
  currentJobActions?: Partial<CurrentJobActions>;
  currentFolder: string | undefined;
  onOpenFolder: (path?: string) => void;
  quickAction: QuickActionOverlayState;
  selectionActions: SelectionActionOverlaysProps;
  renameFile: RenameFileOverlayState | null;
  sidecarSweep: SidecarSweepDialogProps;
  settleAllCandidates: SettleAllCandidatesDialogProps;
  onCaptionSaved: CaptionSavedHandler;
  gallery: GalleryOverlayState;
  issueResolver: Omit<
    PagingOverlayState<ComponentProps<typeof IssueResolverDialog>>,
    "onCaptionSaved"
  >;
  instructions: InstructionsOverlayState;
  stats: ComponentProps<typeof StatsDialog>;
  duplicateResolver: PagingOverlayState<ComponentProps<typeof DuplicateResolverDialog>>;
  candidateReview: PagingOverlayState<ComponentProps<typeof CandidateReviewDialog>>;
  jobStart: JobStartConfirmState;
  automation: AutomationDialogsState;
  workflows: WorkflowOverlaysState;
  fileImport: ComponentProps<typeof FileImportOverwriteDialog> | null;
  createFolder: ComponentProps<typeof CreateFolderDialog> | null;
  renameFolder: RenameFolderOverlayState | null;
  deleteFolder: DeleteFolderOverlayState | null;
  settings: OpenOverlayState;
  shortcuts: OpenOverlayState;
};
