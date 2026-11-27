import type { useGalleryItemCaption } from "@/features/gallery/hooks/useGalleryItemCaption";
import { getGalleryItemCaptionDisplay } from "@/features/gallery/lib/captionStatus";
import { mediaLabelFor } from "@/features/gallery/lib/itemKind";
import type { VocabularyEntry } from "@/features/gallery/lib/captionVocabulary";
import { useCopyFeedback } from "@/shared/hooks/useCopyFeedback";
import {
  iconArchiveRestore,
  iconCopy,
  iconFileDiff,
  iconMessageWarning,
  iconPencilLine,
} from "@/shared/icons";
import type { GalleryItem } from "@/shared/types";
import { Button } from "@/shared/ui/Button";
import { CaptionEditor } from "@/shared/ui/CaptionEditor";
import { CaptionWordDiff } from "@/shared/ui/CaptionWordDiff";
import { TokenEstimate } from "@/shared/ui/TokenEstimate";
import { CaptionSaveStatus } from "./CaptionSaveStatus";

/** A leave whose caption save failed, waiting on the user. */
interface LeaveFailure {
  /** The caption changed elsewhere, so retrying overwrites it. */
  conflict: boolean;
  leaving: boolean;
  saving: boolean;
  onRetry: () => void;
  onDiscard: () => void;
  onKeep: () => void;
}

interface GalleryItemCaptionProps {
  item: GalleryItem;
  editor: ReturnType<typeof useGalleryItemCaption>;
  completions: readonly VocabularyEntry[];
  searchQuery: string;
  searchRegex: boolean;
  busy: boolean;
  leaving: boolean;
  autoFocus: boolean;
  backupCaption: string | null;
  showingBackupDiff: boolean;
  onToggleComparison: () => void;
  onLeaveComparison: () => void;
  /** Set when the file has an issue to resolve. */
  onResolveIssue?: () => void;
  leaveFailure: LeaveFailure | null;
}

/** The viewer's caption: editor, backup comparison, save status and a failed leave's choices. */
export function GalleryItemCaption({
  item,
  editor,
  completions,
  searchQuery,
  searchRegex,
  busy,
  leaving,
  autoFocus,
  backupCaption,
  showingBackupDiff,
  onToggleComparison,
  onLeaveComparison,
  onResolveIssue,
  leaveFailure,
}: GalleryItemCaptionProps) {
  const { caption, saveState, conflict } = editor;
  const { copyState, copyLabel, copyText } = useCopyFeedback();
  const captionDisplay = getGalleryItemCaptionDisplay(item, mediaLabelFor(item));
  const placeholder =
    captionDisplay.variant === "success" ? "Add a caption..." : captionDisplay.message;
  const canRestoreBackup = backupCaption !== null && backupCaption.trim() !== caption.trim();

  return (
    <div className="gallery-item-dialog__caption-editor">
      <div className="gallery-item-dialog__caption-toolbar">
        <div className="gallery-item-dialog__caption-heading">
          <label htmlFor="gallery-item-caption" className="gallery-item-dialog__caption-label">
            Caption
          </label>
          <TokenEstimate text={caption} className="gallery-item-dialog__caption-tokens" />
        </div>
        <div className="gallery-item-dialog__caption-actions">
          {onResolveIssue && !showingBackupDiff && (
            <Button
              variant="warning"
              icon={iconMessageWarning}
              onClick={onResolveIssue}
              disabled={busy}
              aria-label={`Resolve caption issue for ${item.name}`}
              size="xs"
            >
              Resolve
            </Button>
          )}
          {(backupCaption !== null || showingBackupDiff) && (
            <Button
              icon={showingBackupDiff ? iconPencilLine : iconFileDiff}
              onClick={onToggleComparison}
              // The label names the action, not a state: a toggle that renames itself
              // would contradict aria-pressed.
              aria-label={
                showingBackupDiff
                  ? `Back to editing the caption for ${item.name}`
                  : `Compare the caption for ${item.name} with its backup`
              }
              size="xs"
            >
              {showingBackupDiff ? "Back to editing" : "Compare"}
            </Button>
          )}
          {/* Copy acts on the editor's text, which the comparison hides. Restoring
              takes its slot. */}
          {showingBackupDiff ? (
            <Button
              icon={iconArchiveRestore}
              onClick={() => {
                if (backupCaption === null) return;
                editor.handleCaptionChange(backupCaption);
                onLeaveComparison();
              }}
              disabled={busy || !canRestoreBackup}
              aria-label={`Restore the backed up caption for ${item.name}`}
              size="xs"
            >
              Restore
            </Button>
          ) : (
            <Button
              icon={iconCopy}
              feedback={copyState}
              onClick={() => {
                void copyText(caption);
              }}
              disabled={caption.length === 0}
              aria-label={copyLabel}
              size="xs"
            >
              {copyLabel}
            </Button>
          )}
        </div>
      </div>
      {showingBackupDiff && (
        <div
          className="gallery-item-dialog__caption-compare"
          role="region"
          aria-label={`Caption compared with its backup for ${item.name}`}
          tabIndex={0}
        >
          {backupCaption === null ? null : canRestoreBackup ? (
            <CaptionWordDiff
              before={caption.trim()}
              after={backupCaption.trim()}
              legend={{ removed: "Only in this caption", added: "From the backup" }}
              addedVerb="restored"
            />
          ) : (
            <p className="gallery-item-dialog__caption-compare-note">Matches the backup.</p>
          )}
        </div>
      )}
      <CaptionEditor
        // Fresh editor per item: CodeMirror maps selection through a document swap.
        key={item.path}
        id="gallery-item-caption"
        // Hidden, not unmounted, so comparing keeps the editor's undo history.
        className={showingBackupDiff ? "gallery-item-dialog__hidden-editor" : undefined}
        completions={completions}
        value={caption}
        placeholder={placeholder}
        variant={captionDisplay.variant}
        saveState={conflict ? "error" : saveState}
        searchQuery={searchQuery}
        searchRegex={searchRegex}
        aria-label={`Caption for ${item.name}`}
        aria-invalid={saveState === "error" || conflict}
        onChange={editor.handleCaptionChange}
        editable={!leaving && !editor.captionLocked}
        autoFocus={autoFocus}
      />
      {editor.readError && (
        <div className="workspace-save-error" role="alert">
          {/* The placeholder already says why; this says what the button does. */}
          <p>
            {editor.readError === "encoding"
              ? "Replacing it writes a new UTF-8 caption over the file."
              : "Close the program that has it open, then try again."}
          </p>
          {editor.readError === "encoding" ? (
            <Button onClick={editor.replaceUnreadableCaption}>Replace caption</Button>
          ) : (
            <Button onClick={() => void editor.reloadCaption()}>Try again</Button>
          )}
        </div>
      )}
      <CaptionSaveStatus
        state={saveState}
        error={editor.saveError}
        onRetry={editor.retrySave}
        onReload={() => void editor.reloadCaption()}
        onOverwrite={() => void editor.overwriteCaption()}
      />
      {leaveFailure && (
        <div className="workspace-save-error" role="alert">
          <p>
            {leaveFailure.conflict
              ? "The caption changed elsewhere since it was loaded. Overwrite it with yours or discard your changes to continue."
              : "The caption could not be saved. Retry saving or discard the unsaved changes to continue."}
          </p>
          <Button disabled={leaveFailure.leaving} onClick={leaveFailure.onRetry}>
            {leaveFailure.conflict ? "Overwrite and continue" : "Retry and continue"}
          </Button>
          <Button
            disabled={leaveFailure.leaving || leaveFailure.saving}
            onClick={leaveFailure.onDiscard}
          >
            Discard and continue
          </Button>
          <Button onClick={leaveFailure.onKeep}>Keep editing</Button>
        </div>
      )}
    </div>
  );
}
