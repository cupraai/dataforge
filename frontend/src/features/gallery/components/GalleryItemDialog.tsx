import { Button } from "@/shared/ui/Button";
import { IconButton } from "@/shared/ui/IconButton";
import { DiscardChangesDialog } from "@/shared/ui/DiscardChangesDialog";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import type { WorkspaceAction, WorkspaceTransition } from "@/app/hooks/useWorkspaceTransitions";
import type { EmbeddedGenerateWorkflow } from "@/features/automation/types";
import { useMediaQuery } from "@/shared/hooks/useMediaQuery";
import { InspectorPanel } from "@/shared/ui/InspectorPanel";
import { DialogShell } from "@/shared/ui/DialogShell";
import { useDiscardChanges } from "@/shared/hooks/useDiscardChanges";
import { useDialogNavigationDraft } from "@/shared/hooks/useDialogNavigationDraft";
import { DialogSuspendedContext } from "@/shared/ui/dialogSuspendedContext";
import { CAPTION_SIDECAR_EXTENSION_LIST } from "@/shared/lib/captionSidecar";
import {
  galleryItemMediaUrl,
  galleryItemWaveformUrl,
  mediaCacheKey,
} from "@/features/gallery/lib/thumbnail";
import { useComfyWorkflowFlag } from "@/features/gallery/hooks/useComfyWorkflowFlag";
import { useCaptionBackup } from "@/features/gallery/hooks/useCaptionBackup";
import { useGalleryItemCaption } from "@/features/gallery/hooks/useGalleryItemCaption";
import { useGalleryItemFileActions } from "@/features/gallery/hooks/useGalleryItemFileActions";
import { useGalleryItemKeys } from "@/features/gallery/hooks/useGalleryItemKeys";
import { useInspectorWidth } from "@/features/gallery/hooks/useInspectorWidth";
import { useSaveBeforeLeave } from "@/features/gallery/hooks/useSaveBeforeLeave";
import { useGifFrameCapture } from "@/features/gallery/hooks/useGifFrameCapture";
import { useGifFrameCount } from "@/features/gallery/hooks/useGifFrameCount";
import { useGifToMp4 } from "@/features/gallery/hooks/useGifToMp4";
import { useMediaResolution } from "@/features/gallery/hooks/useMediaResolution";
import { useMediaTransfer } from "@/features/gallery/hooks/useMediaTransfer";
import { useImageEdit } from "@/features/gallery/hooks/useImageEdit";
import { useVideoEdit } from "@/features/gallery/hooks/useVideoEdit";
import { useAudioEdit } from "@/features/gallery/hooks/useAudioEdit";
import { audioOriginalWaveformUrl } from "@/features/gallery/api/audioEdit";
import { useVideoFrameCapture } from "@/features/gallery/hooks/useVideoFrameCapture";
import { useEscapeKey } from "@/shared/hooks/useEscapeKey";
import {
  iconArrowUpRight,
  iconCamera,
  iconChevronLeft,
  iconChevronRight,
  iconClapperboard,
  iconCopyPlus,
  iconFiles,
  iconFolderInput,
  iconScanSquare,
  iconSquarePen,
  iconTrash2,
  iconVideo,
  iconX,
  iconExpand,
  iconMinimize2,
  iconPencilLine,
} from "@/shared/icons";
import { isResolvableIssueItem } from "@/features/gallery/lib/issues";
import { isCandidateItem } from "@/features/gallery/lib/candidateReview";
import { isDuplicateItem } from "@/features/gallery/lib/duplicates";
import {
  isAudio,
  isEditableAudio,
  isEditableImage,
  isEditableVideo,
  isGif,
  isModel,
  isMotion,
  isVideo,
  isVideoProjectVideo,
} from "@/features/gallery/lib/itemKind";
import type { AdjustedPicture } from "@/features/gallery/lib/adjustedPicture";
import type { FrameCapture } from "@/features/gallery/lib/frameCapture";
import { formatFrameOrdinal } from "@/features/gallery/lib/gifFrameCapture";
import { formatFrameTime, FRAME_STEP_SECONDS } from "@/features/gallery/lib/videoFrameCapture";
import {
  singleFileCopySuccessMessage,
  singleFileEmptyPreviewMessage,
} from "@/features/gallery/lib/mediaActionMessages";
import type { GalleryItemOpenIntent } from "@/features/gallery/hooks/useGalleryOverlays";
import {
  collectAdjacentDialogMediaTargets,
  schedulePrefetchDialogMedia,
} from "@/features/gallery/lib/dialogMediaPrefetch";
import type { CaptionSaveResponse, GalleryItem } from "@/shared/types";
import { GIF_MP4_FRAME_RATE } from "@/shared/constants";
import { classNames } from "@/shared/lib/classNames";
import { buildCaptionVocabulary } from "@/features/gallery/lib/captionVocabulary";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { FileImportOverwriteDialog } from "@/features/folder/components/FileImportOverwriteDialog";
import { GalleryItemCaption } from "./GalleryItemCaption";
import { FileRenameDialog } from "./FileRenameDialog";
import { MediaInfoBar } from "./MediaInfoBar";
import { ModelInfoStage, ModelMetadataList } from "./ModelInfoPanel";
import { MediaTagList } from "./MediaTagList";
import { Tooltip } from "@/shared/ui/Tooltip";
import { ComfyWorkflowDialog } from "./ComfyWorkflowDialog";
import { TransferMediaDialog } from "./TransferMediaDialog";
import { FrameCaptureBar } from "./FrameCaptureBar";
import { CropOverlay } from "./CropOverlay";
import { AdjustCanvas } from "./AdjustCanvas";
import { MaskOverlay } from "./MaskOverlay";
import { ImageEditPanel } from "./ImageEditPanel";
import { StageHintSlot } from "@/features/gallery/lib/stageHintSlot";
import { ImageEditStage } from "./ImageEditStage";
import { VideoEditPanel } from "./VideoEditPanel";
import { AudioEditPanel } from "./AudioEditPanel";
import { ZoomableImage } from "./ZoomableImage";
import { useStagePaging } from "@/features/gallery/hooks/useStagePaging";
import { AudioWaveform } from "./AudioWaveform";
import { videoOriginalUrl } from "@/features/gallery/api/videoEdit";
import { useMediaPlaybackProblem } from "@/shared/hooks/useMediaPlaybackProblem";
import { canTranscodeAway } from "@/shared/lib/mediaProblems";
import { MediaProblemNotice } from "@/shared/ui/MediaProblemNotice";
import { evenTrunc } from "@/features/gallery/lib/videoEdit";
import { applyRememberedSound, rememberSound } from "@/features/gallery/lib/videoSound";
import { useVideoEditorLauncher } from "@/features/videoEditor/context/VideoEditorContext";
import { useChanged } from "@/shared/hooks/useChanged";
import { useUiSettings } from "@/shared/preferences/uiPreferences";
import { trashName } from "@/shared/lib/platform";

const noop = () => {};

interface GalleryItemDialogProps {
  items: GalleryItem[];
  index: number;
  /** A card asked for this item in a mode; each new object enters it once. */
  openIntent?: GalleryItemOpenIntent | null;
  searchQuery?: string;
  searchRegex?: boolean;
  /** Whether this folder has a caption backup at all; gates the per-file restore. */
  hasCaptionBackup?: boolean;
  /** Transfer picker's origin; move/copy stay hidden without it. */
  currentFolder?: string;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onGoTo?: (index: number) => void;
  onCaptionSaved: (path: string, update: CaptionSaveResponse) => void;
  onDeleted?: (path: string) => void;
  /** Renaming stays hidden without it. */
  onRenamed?: (path: string, renamedPath: string) => void;
  onMoved?: (paths: string[]) => void | Promise<void>;
  onCopied?: () => void | Promise<void>;
  onResolveIssue?: (item: GalleryItem) => void;
  onReviewCandidate?: (item: GalleryItem) => void;
  onResolveDuplicate?: (item: GalleryItem) => void;
  /** Offered in the ComfyUI workflow dialog for an output that can run as a generation. */
  onGenerateFromWorkflow?: (workflow: EmbeddedGenerateWorkflow) => void;
  /** Whether the open item is in the gallery selection; X toggles it when this is given. */
  selected?: boolean;
  onToggleSelect?: (path: string) => void;
  focusView?: boolean;
  onFocusViewChange?: (focus: boolean) => void;
  /** Editing or capture expanded a docked view: the gallery is covered, its layout unsaved. */
  onEditExpandedChange?: (expanded: boolean) => void;
  transitionRef?: RefObject<WorkspaceTransition | null>;
  /** Another dialog covers the viewer; its keys and focus trap must stay off meanwhile. */
  suspended?: boolean;
}

/** The edited sound's pictures, in pixels: the stage's big one and the trim track's strip. */
const AUDIO_STAGE_WAVEFORM_WIDTH = 1200;
const AUDIO_STAGE_WAVEFORM_HEIGHT = 240;
const AUDIO_TRACK_WAVEFORM_HEIGHT = 64;

export function GalleryItemDialog({
  items,
  index,
  openIntent = null,
  searchQuery = "",
  searchRegex = false,
  hasCaptionBackup = false,
  currentFolder,
  onClose,
  onPrevious,
  onNext,
  onGoTo,
  onCaptionSaved,
  onDeleted,
  onRenamed,
  onMoved,
  onCopied,
  onResolveIssue,
  onReviewCandidate,
  onResolveDuplicate,
  onGenerateFromWorkflow,
  selected = false,
  onToggleSelect,
  focusView = true,
  onFocusViewChange,
  onEditExpandedChange,
  transitionRef,
  suspended = false,
}: GalleryItemDialogProps) {
  const item = items[index];
  const { recordResolution, getResolution } = useMediaResolution();
  const hasComfyWorkflow = useComfyWorkflowFlag(item?.path);

  const captionEditor = useGalleryItemCaption({ item, onCaptionSaved });
  const {
    caption,
    flushPendingSave,
    discardCaptionChanges,
    hasUnsavedChanges: captionDirty,
  } = captionEditor;
  const saveLeave = useSaveBeforeLeave({
    unsavedChanges: captionDirty,
    flushPendingSave,
    retrySave: captionEditor.retrySave,
    overwriteCaption: captionEditor.overwriteCaption,
    conflict: captionEditor.conflict,
    saving: captionEditor.saving,
    discardCaptionChanges,
  });
  const { leaving, flushAndLeave: saveAndLeave } = saveLeave;
  const itemIsModel = item ? isModel(item) : false;
  const { taggingEnabled } = useUiSettings();
  const { backup: backupCaption, pending: backupPending } = useCaptionBackup(
    item?.path,
    hasCaptionBackup && !itemIsModel,
  );
  const captionCompletions = useMemo(() => buildCaptionVocabulary(items), [items]);

  // Survives paging, so a review can step through the files without reopening it each time.
  const [comparingBackup, setComparingBackup] = useState(false);
  // A loading backup keeps the comparison up rather than flashing the editor in between.
  const showingBackupDiff = comparingBackup && (backupCaption !== null || backupPending);
  // Owned here so next/prev keeps capture across videos and GIFs; per-hook flags dropped it.
  const [frameMode, setFrameMode] = useState(openIntent?.mode === "frame");
  // Exclusive with frameMode: one `<video>` cannot serve a scrubber and a timeline.
  const [editMode, setEditMode] = useState(openIntent?.mode === "edit");
  const [revertConfirmOpen, setRevertConfirmOpen] = useState(false);
  const [comfyWorkflowOpen, setComfyWorkflowOpen] = useState(false);
  const narrow = useMediaQuery("(max-width: 999px)");
  const dialogRef = useRef<HTMLDivElement>(null);
  const inspector = useInspectorWidth(dialogRef);

  const transferPaths = useMemo(() => (item ? [item.path] : []), [item]);

  const transfer = useMediaTransfer({
    paths: transferPaths,
    onMoved: onMoved ?? noop,
    onCopied: onCopied ?? noop,
    emptyPreviewMessage: singleFileEmptyPreviewMessage,
    copySuccessMessage: singleFileCopySuccessMessage,
  });

  const itemIsGif = item ? isGif(item) : false;
  const itemIsVideo = item ? isVideo(item) : false;
  const itemIsAudio = item ? isAudio(item) : false;
  const gifFrameCount = useGifFrameCount(item, itemIsGif);
  // Editing plays the original, so the problem follows whichever file is on screen.
  const videoSrc =
    item && itemIsVideo
      ? editMode
        ? videoOriginalUrl(item.path)
        : galleryItemMediaUrl(item)
      : undefined;
  const playback = useMediaPlaybackProblem(videoSrc);

  // Both hooks run unconditionally; hooks cannot be called behind a branch.
  const { videoRef, ...videoCapture } = useVideoFrameCapture({
    item,
    folderPath: currentFolder,
    onSaved: onCopied,
    frameMode,
    setFrameMode,
  });
  const gifCapture = useGifFrameCapture({
    item,
    frameCount: gifFrameCount,
    folderPath: currentFolder,
    onSaved: onCopied,
    frameMode,
    setFrameMode,
  });
  const frameCapture: FrameCapture = itemIsGif ? gifCapture : videoCapture;

  const standbyVideoRef = useRef<HTMLVideoElement | null>(null);
  const videoEdit = useVideoEdit({
    item,
    videoRef,
    standbyVideoRef,
    onEdited: onCopied,
    editMode,
    setEditMode,
  });
  const [videoPicture, setVideoPicture] = useState<AdjustedPicture | null>(null);

  const imageEdit = useImageEdit({
    item,
    onEdited: onCopied,
    editMode,
    setEditMode,
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [hintSlot, setHintSlot] = useState<HTMLDivElement | null>(null);
  const audioEdit = useAudioEdit({
    item,
    audioRef,
    onEdited: onCopied,
    editMode,
    setEditMode,
  });

  const gifToMp4 = useGifToMp4({ item, onConverted: onCopied });

  const { transferPicker, overwritePrompt, transferring } = transfer;
  const editApplying = videoEdit.applying || imageEdit.applying || audioEdit.applying;
  const fileActions = useGalleryItemFileActions({
    item,
    busyElsewhere:
      leaving ||
      transferring !== null ||
      gifToMp4.converting ||
      frameCapture.saving ||
      editApplying,
    flushPendingSave,
    onDeleted,
    onRenamed,
    onCopied,
  });
  const otherWorkBusy =
    leaving ||
    fileActions.deleting ||
    fileActions.renaming ||
    transferring !== null ||
    gifToMp4.converting;
  const busy = otherWorkBusy || frameCapture.saving || editApplying || fileActions.converting;
  const parentSuspended = useContext(DialogSuspendedContext);
  const otherOverlayOpen =
    parentSuspended ||
    suspended ||
    fileActions.deleteConfirmOpen ||
    fileActions.renameOpen ||
    revertConfirmOpen ||
    comfyWorkflowOpen ||
    transfer.transferDialogOpen ||
    gifToMp4.conflict !== null;
  const activeEdit =
    item && isEditableVideo(item)
      ? videoEdit
      : item && isEditableAudio(item)
        ? audioEdit
        : imageEdit;
  // Pending work is unsaved too, though Apply would not write it.
  const unsavedEdits = editMode && (activeEdit.dirty || activeEdit.pending);
  useDialogNavigationDraft({
    unsavedChanges: captionDirty,
    blocked: busy,
    save: () => flushPendingSave(true),
    onDiscard: discardCaptionChanges,
  });
  const discard = useDiscardChanges({
    unsavedChanges: unsavedEdits,
    busy,
    suspended: otherOverlayOpen,
    onNavigationDiscard: activeEdit.resetDraft,
  });
  const { request: requestDiscard } = discard;
  const renameDiscard = useDiscardChanges({
    unsavedChanges: unsavedEdits,
    busy,
    suspended: otherOverlayOpen && !fileActions.renameOpen,
    description: "Your unapplied media edits will be lost when this file is renamed.",
  });
  const { request: requestRename } = renameDiscard;
  const flushAndLeave = useCallback(
    async (action: WorkspaceAction) => {
      if (!busy) await saveAndLeave(action);
    },
    [busy, saveAndLeave],
  );
  const resetEditDraft = activeEdit.resetDraft;
  const leave = useCallback(
    (action: WorkspaceAction) =>
      requestDiscard(async () => {
        if (unsavedEdits) resetEditDraft();
        await flushAndLeave(action);
      }),
    [requestDiscard, flushAndLeave, resetEditDraft, unsavedEdits],
  );

  useEffect(() => {
    if (!transitionRef) return;
    transitionRef.current = leave;
    return () => {
      if (transitionRef.current === leave) transitionRef.current = null;
    };
  }, [leave, transitionRef]);
  // Frame mode stays out: this feeds DialogShell.suspended, which would make the slider inert.
  const childOverlayOpen = otherOverlayOpen || discard.confirming || renameDiscard.confirming;
  const canTransfer = Boolean(currentFolder) && Boolean(onMoved) && Boolean(onCopied);

  // Transfer state stays out: a move advances early. Keyed to its item, so paging keeps focus.
  const [focusCaptionOf, setFocusCaptionOf] = useState<string | null>(null);

  if (useChanged(item?.path)) {
    if (item?.path !== focusCaptionOf) setFocusCaptionOf(null);
    setComfyWorkflowOpen(false);
  }

  // The initial states cover a dialog this intent mounted; this one was already open.
  if (useChanged(openIntent) && openIntent) {
    setFrameMode(openIntent.mode === "frame");
    setEditMode(openIntent.mode === "edit");
  }

  // Drop sticky capture on a still or missing destination so the bar needs no scrubber.
  if (frameMode && (!item || !currentFolder || (!itemIsVideo && !itemIsGif))) {
    setFrameMode(false);
  }

  if (
    (editMode || revertConfirmOpen) &&
    (!item || (!isEditableVideo(item) && !isEditableImage(item) && !isEditableAudio(item)))
  ) {
    setEditMode(false);
    setRevertConfirmOpen(false);
  }

  useEffect(() => {
    return schedulePrefetchDialogMedia(collectAdjacentDialogMediaTargets(items, index));
  }, [index, items]);

  // Editing and capture expand the view through `inline` below; the saved layout stays put.
  const toggleFrameMode = useCallback(() => {
    void requestDiscard(() => {
      setEditMode(false);
      frameCapture.toggleFrameMode();
    });
  }, [requestDiscard, frameCapture]);

  const toggleEditMode = useCallback(() => {
    void requestDiscard(() => {
      setFrameMode(false);
      activeEdit.toggleEditMode();
    });
  }, [requestDiscard, activeEdit]);

  const exitEditMode = useCallback(() => {
    void requestDiscard(activeEdit.exitEditMode);
  }, [activeEdit.exitEditMode, requestDiscard]);

  const closeDialog = useCallback(() => {
    if (busy) return;
    void leave(onClose);
  }, [busy, leave, onClose]);

  const { rename } = fileActions;
  const confirmRename = useCallback(
    (name: string) => requestRename(() => rename(name)),
    [rename, requestRename],
  );

  const handleResolveIssue = useCallback(() => {
    if (!item || busy || !onResolveIssue) return;
    void leave(() => onResolveIssue({ ...item, description: caption }));
  }, [busy, caption, leave, item, onResolveIssue]);

  const handleReviewCandidate = useCallback(() => {
    if (!item || busy || !onReviewCandidate) return;
    void leave(() => onReviewCandidate(item));
  }, [busy, leave, item, onReviewCandidate]);

  const handleResolveDuplicate = useCallback(() => {
    if (!item || busy || !onResolveDuplicate) return;
    void leave(() => onResolveDuplicate(item));
  }, [busy, leave, item, onResolveDuplicate]);

  // Derived above the early return so the hooks below are not called conditionally.
  const canEditVideoItem = item ? isEditableVideo(item) : false;
  const videoEditor = useVideoEditorLauncher();
  const canOpenInVideoEditor = Boolean(videoEditor && item && isVideoProjectVideo(item));
  const canEditImageItem = item ? isEditableImage(item) : false;
  const canEditAudioItem = item ? isEditableAudio(item) : false;
  const editing = editMode && (canEditVideoItem || canEditImageItem || canEditAudioItem);
  const inline =
    Boolean(onFocusViewChange) && !focusView && !narrow && !editing && !frameCapture.frameMode;
  // The docked panel is narrow; its actions match the step buttons beside the counter.
  const headerActionSize = inline ? "xs" : "md";
  const editExpanded = editing || frameCapture.frameMode;
  const stageRef = useRef<HTMLDivElement>(null);
  useStagePaging(stageRef, item?.path, index, items.length, !editExpanded);

  useEffect(() => {
    if (!editExpanded || !onEditExpandedChange) return;
    onEditExpandedChange(true);
    return () => onEditExpandedChange(false);
  }, [editExpanded, onEditExpandedChange]);

  const { openTransferPicker } = transfer;
  const openMovePicker = useCallback(() => openTransferPicker("move"), [openTransferPicker]);
  const leaveComparison = useCallback(() => setComparingBackup(false), []);
  useGalleryItemKeys({
    items,
    index,
    item,
    blocked: childOverlayOpen || busy,
    inline,
    panelRef: dialogRef,
    modeOwnsKeys: editing || frameCapture.frameMode,
    showingBackupDiff,
    onLeaveComparison: leaveComparison,
    leave,
    onClose: closeDialog,
    onPrevious,
    onNext,
    onGoTo,
    flushPendingSave,
    onFocusCaptionOf: setFocusCaptionOf,
    onDelete: fileActions.openDeleteConfirm,
    onMove: canTransfer ? openMovePicker : undefined,
    onToggleSelect,
  });

  // In frame/edit mode Escape steps back to viewing; DialogShell stands down via escape="none".
  useEscapeKey(frameCapture.exitFrameMode, frameCapture.frameMode && !busy && !childOverlayOpen);
  useEscapeKey(exitEditMode, editing && !busy && !childOverlayOpen);

  if (!item) return null;

  // The original's sound: what the trims and the preview are measured against.
  const originalWaveform = (width: number, height: number) =>
    canEditAudioItem && audioEdit.ready
      ? audioOriginalWaveformUrl(
          item.path,
          audioEdit.duration,
          width,
          height,
          `${mediaCacheKey(item.modified_at, item.size) ?? ""}-${audioEdit.hasBackup ? 1 : 0}`,
        )
      : undefined;
  const audioStageWaveform = originalWaveform(
    AUDIO_STAGE_WAVEFORM_WIDTH,
    AUDIO_STAGE_WAVEFORM_HEIGHT,
  );
  const audioTrackWaveform = originalWaveform(
    AUDIO_STAGE_WAVEFORM_WIDTH,
    AUDIO_TRACK_WAVEFORM_HEIGHT,
  );

  const resolution = getResolution(item);
  const canResolveIssue = isResolvableIssueItem(item) && Boolean(onResolveIssue);
  const canReviewCandidate = isCandidateItem(item) && Boolean(onReviewCandidate);
  const canResolveDuplicate = isDuplicateItem(item) && Boolean(onResolveDuplicate);
  // Destination folder only; a missing onCopied costs the refresh, not the save.
  const canCaptureFrame = (itemIsVideo || itemIsGif) && Boolean(currentFolder);
  const editKind = canEditVideoItem
    ? "video"
    : canEditAudioItem
      ? "audio"
      : canEditImageItem
        ? "image"
        : null;

  const Surface = inline ? InspectorPanel : DialogShell;
  return (
    <DialogSuspendedContext.Provider value={parentSuspended || leaving}>
      <Surface
        block="gallery-item-dialog"
        label={`Viewing ${item.name}`}
        onClose={closeDialog}
        busy={busy}
        suspended={childOverlayOpen}
        escape={frameCapture.frameMode || editMode || showingBackupDiff ? "none" : "close"}
        panelRef={dialogRef}
        scrollLock="gallery-item-dialog-open"
        style={{ "--inspector-width": `${inspector.width}px` } as CSSProperties}
      >
        {inline && <div className="workspace-inspector-resize" {...inspector.separatorProps} />}
        <header className="gallery-item-dialog__header">
          <div className="gallery-item-dialog__header-text">
            <Tooltip content={item.name} whenTruncated>
              <h2 className="gallery-item-dialog__title">{item.name}</h2>
            </Tooltip>
            {inline && (
              <IconButton
                icon={iconChevronLeft}
                label="Previous item"
                onClick={() => void leave(onPrevious)}
                disabled={busy}
                size="xs"
              />
            )}
            <span className="gallery-item-dialog__counter">
              {index + 1} / {items.length}
            </span>
            {selected && <span className="gallery-item-dialog__selected">Selected</span>}
            {inline && (
              <IconButton
                icon={iconChevronRight}
                label="Next item"
                onClick={() => void leave(onNext)}
                disabled={busy}
                size="xs"
              />
            )}
          </div>
          <div className="gallery-item-dialog__header-actions">
            {(canReviewCandidate || canResolveDuplicate) && (
              <div className="gallery-item-dialog__review-actions">
                {canReviewCandidate && (
                  <IconButton
                    size={headerActionSize}
                    icon={iconScanSquare}
                    label={`Review candidate for ${item.name}`}
                    tooltip="Review candidate"
                    tone="accent"
                    onClick={handleReviewCandidate}
                    disabled={busy}
                  />
                )}
                {canResolveDuplicate && (
                  <IconButton
                    size={headerActionSize}
                    icon={iconFiles}
                    label={`Resolve duplicate for ${item.name}`}
                    tooltip="Resolve duplicate"
                    tone="accent"
                    onClick={handleResolveDuplicate}
                    disabled={busy}
                  />
                )}
              </div>
            )}
            {canOpenInVideoEditor && (
              <IconButton
                size={headerActionSize}
                icon={iconClapperboard}
                label={`Open ${item.name} in the video editor`}
                tooltip="Open in video editor"
                tone="accent"
                onClick={() => void leave(() => videoEditor?.open(item.path))}
                disabled={busy || editing}
              />
            )}
            {editKind && (
              <IconButton
                size={headerActionSize}
                icon={iconSquarePen}
                label={editMode ? `Exit ${editKind} editing for ${item.name}` : `Edit ${item.name}`}
                tooltip={editMode ? `Exit ${editKind} editing` : `Edit ${editKind}`}
                tone="accent"
                pressed={editMode}
                onClick={toggleEditMode}
                // Editing needs a picture to draw on; the notice over the video says why.
                disabled={busy || (editKind === "video" && playback.problem !== null && !editMode)}
              />
            )}
            {!isMotion(item) && !itemIsAudio && !itemIsModel && (
              <IconButton
                size={headerActionSize}
                icon={iconArrowUpRight}
                label="Open in image preview"
                tooltip={fileActions.viewerError ?? "Open in image preview"}
                tone="accent"
                busy={fileActions.openingInViewer}
                onClick={() => {
                  void fileActions.openInViewer();
                }}
                disabled={busy}
              />
            )}
            {itemIsGif && (
              <IconButton
                size={headerActionSize}
                icon={iconVideo}
                label={`Convert ${item.name} to MP4`}
                tooltip={`Convert to MP4 (${GIF_MP4_FRAME_RATE} fps)`}
                tone="accent"
                busy={gifToMp4.converting}
                onClick={gifToMp4.convert}
                disabled={busy}
              />
            )}
            {canCaptureFrame && (
              <IconButton
                size={headerActionSize}
                icon={iconCamera}
                label={
                  frameCapture.frameMode
                    ? `Exit frame capture for ${item.name}`
                    : `Save a frame from ${item.name}`
                }
                tooltip={frameCapture.frameMode ? "Exit frame capture" : "Save a frame as JPG"}
                tone="accent"
                pressed={frameCapture.frameMode}
                onClick={toggleFrameMode}
                disabled={busy || (playback.problem !== null && !frameCapture.frameMode)}
              />
            )}
            {canTransfer && (
              <>
                <IconButton
                  size={headerActionSize}
                  icon={iconCopyPlus}
                  label={`Copy ${item.name} to another folder`}
                  tooltip="Copy file"
                  tone="accent"
                  busy={transferring === "copy"}
                  onClick={() => void flushAndLeave(() => transfer.openTransferPicker("copy"))}
                  disabled={busy}
                />
                <IconButton
                  size={headerActionSize}
                  icon={iconFolderInput}
                  label={`Move ${item.name} to another folder`}
                  tooltip="Move file"
                  tone="accent"
                  busy={transferring === "move"}
                  onClick={() => void leave(() => transfer.openTransferPicker("move"))}
                  disabled={busy}
                />
              </>
            )}
            {onRenamed && (
              <IconButton
                size={headerActionSize}
                icon={iconPencilLine}
                label={`Rename ${item.name}`}
                tooltip="Rename file"
                tone="accent"
                onClick={fileActions.openRename}
                disabled={busy}
              />
            )}
            <IconButton
              size={headerActionSize}
              icon={iconTrash2}
              label={`Delete ${item.name}`}
              tooltip="Delete file"
              tone="danger"
              onClick={fileActions.openDeleteConfirm}
              disabled={busy}
            />
            <div className="gallery-item-dialog__presentation-actions">
              {onFocusViewChange && !itemIsModel && (
                <IconButton
                  size={headerActionSize}
                  icon={focusView ? iconMinimize2 : iconExpand}
                  label={focusView ? "Minimize to caption inspector" : "Expand media view"}
                  disabled={busy || editing || frameCapture.frameMode}
                  onClick={() => onFocusViewChange(!focusView)}
                />
              )}
              <IconButton
                size={headerActionSize}
                icon={iconX}
                label="Close"
                tooltip={false}
                onClick={closeDialog}
                disabled={busy}
              />
            </div>
          </div>
        </header>

        <div
          ref={stageRef}
          className={classNames(
            "gallery-item-dialog__stage",
            editing && "gallery-item-dialog__stage--editing",
          )}
        >
          {!inline && (
            <IconButton
              icon={iconChevronLeft}
              label="Previous item"
              className="gallery-item-dialog__nav gallery-item-dialog__nav--prev"
              onClick={() => void leave(onPrevious)}
              disabled={busy}
              size="lg"
              shape="round"
              tooltip={false}
            />
          )}

          {itemIsVideo ? (
            <>
              <div className="gallery-item-dialog__video-backdrop">
                <video
                  // Editing plays the original, so source and key change with the mode, not just the bytes.
                  key={`${editMode ? `${item.path}#original` : item.path}#${playback.retryKey}`}
                  ref={videoRef}
                  className="gallery-item-dialog__video"
                  style={{
                    opacity: !editMode || videoEdit.activeMediaRef !== standbyVideoRef ? 1 : 0,
                  }}
                  aria-hidden={editMode && videoEdit.activeMediaRef === standbyVideoRef}
                  src={videoSrc}
                  {...playback.mediaProps}
                  // Native timeline would seek behind the capture slider or trim handles.
                  controls={!frameCapture.frameMode && !editMode}
                  autoPlay
                  // Editing loops the trim band; capture, since Chrome wraps a looping video seeking its last frame.
                  loop={!editMode && !frameCapture.frameMode}
                  muted
                  playsInline
                  onLoadedMetadata={(event) => {
                    const video = event.currentTarget;
                    playback.noteMetadata(video);
                    recordResolution(video.videoWidth, video.videoHeight, item.path);
                    videoCapture.handleLoadedMetadata(video);
                    // Edit mode drives sound itself, and swaps it between this and the standby.
                    if (!editMode) applyRememberedSound(video);
                    videoEdit.handleLoadedMetadata(video);
                  }}
                  onVolumeChange={(event) => {
                    if (!editMode) rememberSound(event.currentTarget);
                  }}
                  // Streamed MP4s report Infinity at loadedmetadata and settle later, stranding the slider.
                  onDurationChange={(event) => {
                    videoCapture.handleLoadedMetadata(event.currentTarget);
                    videoEdit.handleLoadedMetadata(event.currentTarget);
                  }}
                />
                {editMode && canEditVideoItem && (
                  <video
                    key={`${item.path}#standby`}
                    ref={standbyVideoRef}
                    className="gallery-item-dialog__video gallery-item-dialog__video--standby"
                    style={{ opacity: videoEdit.activeMediaRef === standbyVideoRef ? 1 : 0 }}
                    aria-hidden={videoEdit.activeMediaRef !== standbyVideoRef}
                    src={videoOriginalUrl(item.path)}
                    preload="auto"
                    muted
                    playsInline
                  />
                )}
                {playback.problem && (
                  <MediaProblemNotice
                    problem={playback.problem}
                    onRetry={playback.retry}
                    action={
                      canEditVideoItem && !editMode && canTranscodeAway(playback.problem) ? (
                        <Tooltip content="Re-encodes it in place; Revert original brings it back">
                          <Button
                            size="xs"
                            onClick={() => void fileActions.convertToPlayable()}
                            disabled={busy}
                          >
                            {fileActions.converting ? "Converting..." : "Convert to H.264"}
                          </Button>
                        </Tooltip>
                      ) : undefined
                    }
                  />
                )}
              </div>
              {editMode && canEditVideoItem && (
                <AdjustCanvas
                  key={item.path}
                  mediaRef={videoEdit.activeMediaRef}
                  sourceWidth={videoEdit.sourceWidth}
                  sourceHeight={videoEdit.sourceHeight}
                  crop={videoEdit.draft.crop}
                  scale={videoEdit.draft.scale}
                  effect={videoEdit.draft.effect}
                  controls={videoEdit.adjust}
                  onPictureChange={setVideoPicture}
                />
              )}
              {editMode && videoEdit.draft.masks.length > 0 && !videoEdit.adjust.zoomed && (
                <MaskOverlay
                  mediaRef={videoEdit.activeMediaRef}
                  src={videoOriginalUrl(item.path)}
                  masks={videoEdit.draft.masks}
                  selectedId={videoEdit.selectedMaskId}
                  sourceWidth={videoEdit.sourceWidth}
                  sourceHeight={videoEdit.sourceHeight}
                  disabled={busy}
                  interactive={videoEdit.maskActive}
                  picture={videoPicture}
                  onSelect={videoEdit.selectMask}
                  onChange={videoEdit.setMaskRect}
                  onRemove={videoEdit.removeMask}
                />
              )}
              {editMode && videoEdit.cropActive && (
                <CropOverlay
                  mediaRef={videoEdit.activeMediaRef}
                  crop={videoEdit.draft.crop}
                  sourceWidth={videoEdit.sourceWidth}
                  sourceHeight={videoEdit.sourceHeight}
                  aspectRatio={videoEdit.aspectRatio}
                  round={evenTrunc}
                  disabled={busy}
                  onCropChange={videoEdit.setCrop}
                />
              )}
            </>
          ) : itemIsAudio && editMode && canEditAudioItem ? (
            <div className="gallery-item-dialog__audio">
              <AudioWaveform
                src={audioStageWaveform ?? galleryItemWaveformUrl(item)}
                className="gallery-item-dialog__waveform"
              />
              <audio
                // The hook sets the source: the original, or the proxy that carries its effects.
                key={`${item.path}#edit`}
                ref={audioRef}
                preload="auto"
                onLoadedMetadata={(event) => audioEdit.handleLoadedMetadata(event.currentTarget)}
              />
            </div>
          ) : itemIsAudio ? (
            <div className="gallery-item-dialog__audio">
              <AudioWaveform
                src={galleryItemWaveformUrl(item)}
                className="gallery-item-dialog__waveform"
              />
              <audio
                // Paging swaps the element, so the next clip starts from the top, not mid-play.
                key={item.path}
                className="gallery-item-dialog__audio-player"
                src={galleryItemMediaUrl(item)}
                controls
                preload="metadata"
              />
            </div>
          ) : itemIsModel ? (
            <ModelInfoStage item={item} />
          ) : editMode && canEditImageItem ? (
            <ImageEditStage edit={imageEdit} path={item.path} alt={item.name} disabled={busy} />
          ) : (
            <ZoomableImage
              // Frame mode swaps in a still; a leftover GIF zoom would apply to a differently decoded image.
              key={gifCapture.previewUrl ? `${item.path}#frame` : item.path}
              className="gallery-item-dialog__media-wrap"
              imgClassName="gallery-item-dialog__img"
              src={gifCapture.previewUrl ?? galleryItemMediaUrl(item)}
              alt={item.name}
              onLoad={(event) => {
                const img = event.currentTarget;
                recordResolution(img.naturalWidth, img.naturalHeight, item.path);
              }}
            />
          )}

          {/* The edit panels portal their hint here, over the media they describe. */}
          {editMode && <div ref={setHintSlot} className="gallery-item-dialog__hint-slot" />}

          {!inline && (
            <IconButton
              icon={iconChevronRight}
              label="Next item"
              className="gallery-item-dialog__nav gallery-item-dialog__nav--next"
              onClick={() => void leave(onNext)}
              disabled={busy}
              size="lg"
              shape="round"
              tooltip={false}
            />
          )}
        </div>

        {frameCapture.frameMode &&
          (itemIsGif ? (
            <FrameCaptureBar
              min={0}
              max={Math.max(0, gifCapture.frameCount - 1)}
              step={1}
              value={gifCapture.frameIndex}
              ready={gifCapture.ready}
              saving={gifCapture.saving}
              busy={otherWorkBusy}
              currentLabel={formatFrameOrdinal(gifCapture.frameIndex, gifCapture.frameCount)}
              totalLabel={String(gifCapture.frameCount)}
              hint="Frame count loads with the GIF."
              onValueChange={gifCapture.setFrameIndex}
              onStepFrame={gifCapture.stepFrame}
              onSave={gifCapture.saveFrame}
            />
          ) : (
            <FrameCaptureBar
              min={0}
              max={videoCapture.sliderMax}
              step={FRAME_STEP_SECONDS}
              value={videoCapture.sliderTime}
              ready={videoCapture.ready}
              saving={videoCapture.saving}
              busy={otherWorkBusy}
              currentLabel={formatFrameTime(videoCapture.displayTime)}
              totalLabel={formatFrameTime(videoCapture.duration)}
              hint="Frame times load with the video."
              onValueChange={videoCapture.setSliderTime}
              onStepFrame={videoCapture.stepFrame}
              onSave={videoCapture.saveFrame}
            />
          ))}

        <StageHintSlot.Provider value={hintSlot}>
          {editMode && canEditVideoItem && (
            <VideoEditPanel
              edit={videoEdit}
              busy={otherWorkBusy}
              onRevertRequested={() => setRevertConfirmOpen(true)}
            />
          )}

          {editMode && canEditAudioItem && (
            <AudioEditPanel
              edit={audioEdit}
              waveformUrl={audioTrackWaveform}
              busy={otherWorkBusy}
              onRevertRequested={() => setRevertConfirmOpen(true)}
            />
          )}

          {editMode && canEditImageItem && (
            <ImageEditPanel
              edit={imageEdit}
              busy={otherWorkBusy}
              onRevertRequested={() => setRevertConfirmOpen(true)}
            />
          )}
        </StageHintSlot.Provider>

        {!editMode && (
          <>
            <MediaInfoBar
              className="gallery-item-dialog__meta"
              item={item}
              resolution={resolution}
              hasComfyWorkflow={hasComfyWorkflow}
              onInspectComfyWorkflow={() => setComfyWorkflowOpen(true)}
            />
            {taggingEnabled && !inline && !itemIsModel && !itemIsAudio && (
              <MediaTagList tags={item.tags} />
            )}
            {itemIsModel ? (
              <footer className="gallery-item-dialog__footer">
                <ModelMetadataList item={item} />
              </footer>
            ) : (
              <footer className="gallery-item-dialog__footer">
                <GalleryItemCaption
                  item={item}
                  editor={captionEditor}
                  completions={captionCompletions}
                  searchQuery={searchQuery}
                  searchRegex={searchRegex}
                  busy={busy}
                  leaving={leaving}
                  autoFocus={focusCaptionOf === item.path}
                  backupCaption={backupCaption}
                  showingBackupDiff={showingBackupDiff}
                  onToggleComparison={() => setComparingBackup((current) => !current)}
                  onLeaveComparison={leaveComparison}
                  onResolveIssue={canResolveIssue ? handleResolveIssue : undefined}
                  leaveFailure={
                    saveLeave.failed
                      ? {
                          conflict: captionEditor.conflict,
                          leaving,
                          saving: captionEditor.saving,
                          onRetry: () => void saveLeave.retryAndContinue(leave),
                          onDiscard: saveLeave.discardAndContinue,
                          onKeep: saveLeave.keepEditing,
                        }
                      : null
                  }
                />
              </footer>
            )}
          </>
        )}
      </Surface>
      {discard.promptProps && <DiscardChangesDialog {...discard.promptProps} />}
      {renameDiscard.promptProps && <DiscardChangesDialog {...renameDiscard.promptProps} />}

      {fileActions.deleteConfirmOpen && (
        <ConfirmDialog
          title="Delete file?"
          description={
            <span>
              This will delete <strong>{item.name}</strong>, any matching caption sidecars (
              {CAPTION_SIDECAR_EXTENSION_LIST}) in this folder, and the stored original if the file
              has been edited.
              <br />
              Files are moved to the {trashName()}.
            </span>
          }
          confirmLabel="Delete"
          confirmVariant="danger"
          busy={fileActions.deleting}
          onConfirm={() => {
            void fileActions.confirmDelete();
          }}
          onCancel={fileActions.cancelDeleteConfirm}
        />
      )}

      {fileActions.renameOpen && (
        <FileRenameDialog
          fileName={item.name}
          busy={fileActions.renaming}
          suspended={renameDiscard.confirming}
          error={fileActions.renameError}
          onConfirm={(name) => {
            void confirmRename(name);
          }}
          onCancel={fileActions.cancelRename}
        />
      )}

      {revertConfirmOpen && (
        <ConfirmDialog
          title="Restore the original?"
          description={
            <span>
              This replaces <strong>{item.name}</strong> with the untouched original stored beside
              it, and discards every edit applied so far.
            </span>
          }
          confirmLabel="Restore"
          confirmVariant="danger"
          busy={editApplying}
          onConfirm={() => {
            setRevertConfirmOpen(false);
            activeEdit.revert();
          }}
          onCancel={() => setRevertConfirmOpen(false)}
        />
      )}

      {gifToMp4.conflict && (
        <ConfirmDialog
          title="Replace the existing MP4?"
          description={
            <span>
              <strong>{gifToMp4.conflict}</strong> already sits beside this GIF. Converting replaces
              it with a fresh encode of the animation.
            </span>
          }
          confirmLabel="Replace"
          confirmVariant="danger"
          onConfirm={gifToMp4.confirmOverwrite}
          onCancel={gifToMp4.cancelOverwrite}
        />
      )}

      {comfyWorkflowOpen && (
        <ComfyWorkflowDialog
          mediaPath={item.path}
          mediaName={item.name}
          onClose={() => setComfyWorkflowOpen(false)}
          onGenerate={onGenerateFromWorkflow}
        />
      )}

      {transferPicker && currentFolder && (
        <TransferMediaDialog
          mode={transferPicker}
          currentFolder={currentFolder}
          selectedCount={1}
          description={
            <>
              Choose a destination for <strong>{item.name}</strong>.
            </>
          }
          busy={transferring !== null}
          onClose={transfer.closeTransferPicker}
          onSelectDestination={(path) => {
            transfer.selectDestination(transferPicker, path);
          }}
        />
      )}

      {overwritePrompt && (
        <FileImportOverwriteDialog
          conflicts={overwritePrompt.conflicts}
          busy={transferring !== null}
          descriptionSuffix={
            overwritePrompt.mode === "move"
              ? "Choose whether to replace them or move only new files."
              : "Choose whether to replace them or copy only new files."
          }
          onReplaceExisting={() => transfer.confirmOverwrite(true)}
          onCopyNewOnly={() => transfer.confirmOverwrite(false)}
          onCancel={transfer.closeOverwritePrompt}
        />
      )}
    </DialogSuspendedContext.Provider>
  );
}
