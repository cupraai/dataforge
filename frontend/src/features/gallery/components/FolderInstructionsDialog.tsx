import { DiscardChangesDialog } from "@/shared/ui/DiscardChangesDialog";
import { useCallback, useState } from "react";
import { saveInstructionFile, type InstructionKind } from "@/shared/api/folderInstructions";
import { formatApiError } from "@/shared/api/http";
import { CAPTION_RULES_FILENAME, SYSPROMPT_FILENAME } from "@/shared/constants";
import { jobTypeLabelFor } from "@/features/jobs/lib/jobMeta";
import { useFolderInstructions } from "@/shared/hooks/useFolderInstructions";
import { useTabList } from "@/shared/hooks/useTabList";
import { DialogShell } from "@/shared/ui/DialogShell";
import { iconFileText, iconListChecks, iconLoader2, iconLock, iconX } from "@/shared/icons";
import type { InstructionFileResponse, JobType } from "@/shared/types";
import { classNames } from "@/shared/lib/classNames";
import { formatCount } from "@/shared/lib/format";
import { DialogButton } from "@/shared/ui/Dialog";
import { useDiscardChanges } from "@/shared/hooks/useDiscardChanges";
import { Icon } from "@/shared/ui/Icon";
import { MarkdownEditor } from "@/shared/ui/MarkdownEditor";
import { TokenEstimate } from "@/shared/ui/TokenEstimate";
import { YamlEditor } from "@/shared/ui/YamlEditor";
import { CodeMirrorEditor } from "@/shared/ui/CodeMirrorEditor";
import {
  INSTRUCTION_ORIGIN_LABELS,
  INSTRUCTION_STATUS_LABELS,
} from "@/shared/lib/instructionFileState";

interface InstructionDocument {
  label: string;
  filename: string;
  placeholder: string;
  help: string;
  /** The job that reads the file; the backend refuses edits while one is queued or running. */
  readBy: JobType;
}

const DOCUMENTS: Record<InstructionKind, InstructionDocument> = {
  sysprompt: {
    label: "System prompt",
    filename: SYSPROMPT_FILENAME,
    placeholder: "# Caption instructions\n\nDescribe the subject, details, and caption format...",
    help: "Used by Auto-caption. Start with a # heading; deeper headings may follow.",
    readBy: "auto_caption",
  },
  caption_rules: {
    label: "Caption rules",
    filename: CAPTION_RULES_FILENAME,
    placeholder: "No caption rules for this folder. Write YAML here, or start from the template.",
    help: "Used by Lint captions to check captions against YAML rules without a model.",
    readBy: "check_caption_rules",
  },
};

const KINDS = Object.keys(DOCUMENTS) as InstructionKind[];

const SAVE_ORDER: readonly InstructionKind[] = ["caption_rules", "sysprompt"];

const NO_DRAFTS: Record<InstructionKind, string | null> = { sysprompt: null, caption_rules: null };

interface FolderInstructionsDialogProps {
  folderPath: string;
  initialTab?: InstructionKind;
  onClose: () => void;
  onSaved: (kind: InstructionKind, saved: InstructionFileResponse) => void;
}

function lineCount(text: string): number {
  return text.length === 0 ? 0 : text.replace(/\n$/, "").split("\n").length;
}

export function FolderInstructionsDialog({
  folderPath,
  initialTab = "sysprompt",
  onClose,
  onSaved,
}: FolderInstructionsDialogProps) {
  const [tab, setTab] = useState<InstructionKind>(initialTab);
  const { state, instructions, setFile, retry } = useFolderInstructions(folderPath);
  // Null until edited, so the text shown follows whatever was last loaded or saved.
  const [drafts, setDrafts] = useState(NO_DRAFTS);
  const [inherit, setInherit] = useState<Record<InstructionKind, boolean>>({
    sysprompt: false,
    caption_rules: false,
  });
  const [errors, setErrors] = useState<Record<InstructionKind, string | null>>(NO_DRAFTS);
  const [saving, setSaving] = useState(false);
  const tabs = useTabList(KINDS, tab, setTab);

  const textOf = (kind: InstructionKind) => drafts[kind] ?? instructions?.[kind].text ?? "";
  const editedKinds = KINDS.filter(
    (kind) =>
      instructions !== null &&
      (textOf(kind) !== instructions[kind].text ||
        (drafts[kind] === "" && instructions[kind].has_file)),
  );
  const edited = editedKinds.length > 0;
  const unsavedNames = editedKinds.map((kind) => DOCUMENTS[kind].label.toLowerCase()).join(" and ");
  const discard = useDiscardChanges({
    unsavedChanges: edited,
    busy: saving,
    onNavigationDiscard: onClose,
    description: `Your changes to the ${unsavedNames} will be lost. This cannot be undone.`,
  });

  const setDraft = useCallback((kind: InstructionKind, value: string | null) => {
    setDrafts((current) => ({ ...current, [kind]: value }));
    setInherit((current) => ({ ...current, [kind]: false }));
    setErrors((current) => ({ ...current, [kind]: null }));
  }, []);

  const handleSave = async () => {
    if (saving || !edited) return;

    setSaving(true);
    try {
      for (const kind of SAVE_ORDER.filter((entry) => editedKinds.includes(entry))) {
        try {
          const saved = await saveInstructionFile(kind, folderPath, textOf(kind));
          setFile(kind, saved);
          setDraft(kind, null);
          onSaved(kind, saved);
        } catch (error) {
          setErrors((current) => ({ ...current, [kind]: formatApiError(error) }));
          setTab(kind);
          return;
        }
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  // The one exit path: close button, Escape and backdrop all land here.
  const requestClose = () => {
    void discard.request(onClose);
  };

  const viewOf = (kind: InstructionKind) => {
    const file = instructions?.[kind];
    const reverting = file?.has_file && inherit[kind] && file.parent_state !== null;
    const source = reverting ? file.parent_state : file?.state;
    const preview = Boolean(
      reverting ||
      (drafts[kind] === null && (!file?.has_file || file.state.status === "unreadable")),
    );
    return {
      file,
      source,
      preview,
      reverting,
      text: preview ? (source?.text ?? "") : textOf(kind),
    };
  };

  const text = viewOf(tab).text;

  const renderEditor = (kind: InstructionKind) => {
    const { file, source, preview, reverting, text: visibleText } = viewOf(kind);
    if (!file || !source || !instructions) return null;
    const details = DOCUMENTS[kind];
    const locked = file.locked_by_job_id !== null;
    const localDraft = drafts[kind] !== null && !reverting;
    const sourceError = !localDraft && source.message !== null;
    const editorProps = {
      id: `${kind}-editor`,
      className: classNames("code-editor--muted", errors[kind] && "code-editor--error"),
      value: visibleText,
      placeholder: details.placeholder,
      "aria-label": details.label,
      "aria-invalid": errors[kind] !== null || (!localDraft && source.status === "invalid"),
      editable: !saving && !locked && !preview,
      onChange: (value: string) => setDraft(kind, value),
    };

    const empty = preview && source.status === "missing";
    const actions = locked ? null : (
      <div className="folder-instructions-dialog__source-actions">
        {preview &&
          source.origin === "inherited" &&
          source.status !== "unreadable" &&
          !reverting && (
            <DialogButton
              label="Customize for this folder"
              variant="secondary"
              disabled={saving}
              onClick={() => setDraft(kind, source.text)}
            />
          )}
        {empty && (
          <DialogButton
            label="Create instructions"
            variant={kind === "sysprompt" ? "primary" : "secondary"}
            disabled={saving}
            onClick={() => setDraft(kind, "")}
          />
        )}
        {file.has_file && file.parent_state && !reverting && (
          <DialogButton
            label="Use inherited instructions"
            variant="secondary"
            disabled={saving}
            onClick={() => {
              setDraft(kind, "");
              setInherit((current) => ({ ...current, [kind]: true }));
            }}
          />
        )}
        {source.status === "unreadable" && !localDraft && (
          <>
            <DialogButton
              label="Retry"
              variant="secondary"
              disabled={saving}
              onClick={() => {
                void retry();
              }}
            />
            {preview && (
              <DialogButton
                label={file.has_file ? "Replace unreadable file" : "Create local instructions"}
                variant="secondary"
                disabled={saving}
                onClick={() => setDraft(kind, "")}
              />
            )}
          </>
        )}
        {kind === "caption_rules" && textOf(kind).trim() === "" && !file.parent_state && (
          <DialogButton
            label="Use template"
            variant={empty ? "primary" : "secondary"}
            disabled={saving}
            onClick={() => setDraft(kind, instructions.caption_rules_template)}
          />
        )}
      </div>
    );
    const tone = localDraft ? "draft" : source.origin;

    return (
      <>
        <div
          className="folder-instructions-dialog__source"
          role="group"
          aria-label="Instruction source"
        >
          <div className="folder-instructions-dialog__source-row">
            <div className="folder-instructions-dialog__source-heading">
              <span
                className={`folder-instructions-dialog__origin folder-instructions-dialog__origin--${tone}`}
              >
                {localDraft ? "Local draft" : INSTRUCTION_ORIGIN_LABELS[source.origin]}
              </span>
              <span
                className="folder-instructions-dialog__source-text"
                title={source.source_path ?? undefined}
              >
                {localDraft
                  ? details.filename
                  : (source.relative_path ?? `No ${details.filename} found`)}
              </span>
              {source.status !== "ready" && source.status !== "missing" && !localDraft && (
                <span className="folder-instructions-dialog__badge">
                  {INSTRUCTION_STATUS_LABELS[source.status]}
                </span>
              )}
            </div>
            {!empty && actions}
          </div>
          <p className="folder-instructions-dialog__help">
            {details.help}{" "}
            {reverting
              ? `Saving removes the local file and uses ${source.relative_path}.`
              : localDraft
                ? file.has_file
                  ? "Changes apply after you save. Saving empty removes the local file."
                  : file.state.origin === "inherited"
                    ? "This draft replaces the inherited instructions only after you save."
                    : "Saving creates instructions in this folder."
                : source.origin === "missing"
                  ? "Create instructions here, or add them to a parent folder."
                  : "Applies here and to subfolders without their own file of this kind."}
            {file.has_file && file.parent_relative_path && !reverting && (
              <>
                {" "}
                Replaces{" "}
                <strong title={file.parent_state?.source_path ?? undefined}>
                  {file.parent_relative_path}
                </strong>
                .
              </>
            )}
          </p>
          {sourceError && (
            <p className="folder-instructions-dialog__problem" role="alert">
              {source.message}
            </p>
          )}
          {locked && (
            <p className="folder-instructions-dialog__locked" role="status">
              <Icon icon={iconLock} className="folder-instructions-dialog__locked-icon" />
              <span>
                Locked while <strong>{jobTypeLabelFor(details.readBy)}</strong> runs
              </span>
            </p>
          )}
        </div>
        {empty ? (
          <div className="folder-instructions-dialog__empty">
            <Icon
              icon={kind === "sysprompt" ? iconFileText : iconListChecks}
              className="folder-instructions-dialog__empty-icon"
            />
            <strong className="folder-instructions-dialog__empty-title">
              No {details.label.toLowerCase()} yet
            </strong>
            <p className="folder-instructions-dialog__empty-text">
              {kind === "sysprompt"
                ? "Create a prompt to guide Auto-caption, for example:"
                : "Create YAML rules or start from the template, for example:"}
            </p>
            <pre className="folder-instructions-dialog__example">
              <code>
                {kind === "sysprompt"
                  ? "# Caption instructions\n\nDescribe the main subject, visible details, and setting."
                  : "words:\n  min: 8\n  max: 120"}
              </code>
            </pre>
            {actions}
          </div>
        ) : preview || locked ? (
          <CodeMirrorEditor
            {...editorProps}
            language={kind === "sysprompt" ? "markdown" : "yaml"}
          />
        ) : kind === "sysprompt" ? (
          <MarkdownEditor {...editorProps} />
        ) : (
          <YamlEditor {...editorProps} />
        )}
      </>
    );
  };

  return (
    <DialogShell
      block="folder-instructions-dialog"
      label="Folder instructions"
      onClose={requestClose}
      busy={saving}
      suspended={discard.confirming}
      scrollLock="folder-instructions-dialog-open"
      escape="editor"
    >
      <header className="folder-instructions-dialog__header">
        <div className="folder-instructions-dialog__header-text">
          <div className="folder-instructions-dialog__header-copy">
            <h2 className="folder-instructions-dialog__title">Folder instructions</h2>
            <p className="folder-instructions-dialog__subtitle" title={folderPath}>
              {folderPath}
            </p>
          </div>
        </div>
        <div className="folder-instructions-dialog__header-actions">
          <button
            type="button"
            className="folder-instructions-dialog__close"
            onClick={requestClose}
            disabled={saving}
            aria-label="Close"
          >
            <Icon icon={iconX} />
          </button>
        </div>
      </header>

      <div
        {...tabs.tabListProps}
        aria-label="Folder instructions"
        className="folder-instructions-dialog__tabs"
      >
        {KINDS.map((kind) => (
          <button
            key={kind}
            {...tabs.tabProps(kind)}
            className={classNames(
              "folder-instructions-dialog__tab",
              kind === tab && "folder-instructions-dialog__tab--active",
            )}
          >
            {DOCUMENTS[kind].label}
            {editedKinds.includes(kind) && (
              <span className="folder-instructions-dialog__tab-dot" aria-hidden="true" />
            )}
          </button>
        ))}
      </div>

      {KINDS.map((kind) => (
        <div key={kind} {...tabs.panelProps(kind)} className="folder-instructions-dialog__body">
          {state.status === "loading" && (
            <p className="folder-instructions-dialog__status" role="status">
              <Icon icon={iconLoader2} spin className="folder-instructions-dialog__status-icon" />
              Loading folder instructions...
            </p>
          )}

          {state.status === "error" && (
            <p
              className="folder-instructions-dialog__status folder-instructions-dialog__status--error"
              role="alert"
            >
              Could not load the folder instructions. {state.message}
              <DialogButton
                label="Retry"
                variant="secondary"
                onClick={() => {
                  void retry();
                }}
              />
            </p>
          )}

          {renderEditor(kind)}
        </div>
      ))}

      {errors[tab] && (
        <p className="folder-instructions-dialog__error" role="alert">
          {errors[tab]}
        </p>
      )}

      <footer className="folder-instructions-dialog__footer">
        <div
          className="folder-instructions-dialog__meta"
          aria-label={tab === "sysprompt" ? "Prompt statistics" : "Rule statistics"}
        >
          {tab === "sysprompt" ? (
            <TokenEstimate text={text} className="folder-instructions-dialog__meta-value" />
          ) : (
            <div className="folder-instructions-dialog__meta-value">
              {formatCount(lineCount(text))} lines
            </div>
          )}
        </div>

        <DialogButton
          label="Reset"
          variant="secondary"
          disabled={saving || !editedKinds.includes(tab)}
          onClick={() => setDraft(tab, null)}
        />
        <DialogButton
          label={saving ? "Saving..." : "Save"}
          variant="primary"
          busy={saving}
          disabled={!edited}
          onClick={() => {
            void handleSave();
          }}
        />
      </footer>

      {discard.promptProps && <DiscardChangesDialog {...discard.promptProps} />}
    </DialogShell>
  );
}
