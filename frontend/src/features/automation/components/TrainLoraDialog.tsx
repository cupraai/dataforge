import { Field, TextInput } from "@/shared/ui/Field";
import { jobTypeIconFor } from "@/features/jobs/lib/jobMeta";
import { IconButton } from "@/shared/ui/IconButton";
import { Button } from "@/shared/ui/Button";
import { GuardedDialog } from "@/shared/ui/GuardedDialog";
import { useCallback, useId, useRef, useState } from "react";
import type { TrainLoraSettings } from "@/features/automation/api/jobs";
import {
  DEFAULT_TRAINING_PROMPTS,
  TRAINING_MODEL_OPTIONS,
  cleanTrainingPrompts,
  trainingModelLabel,
  validateLoraName,
} from "@/features/automation/lib/training";
import { useTrainingTemplateDraft } from "@/features/automation/hooks/useTrainingTemplateDraft";
import type { TrainingModel } from "@/shared/types";
import { iconFilePen, iconPlus, iconTrash2, iconTriangleAlert } from "@/shared/icons";
import { Icon } from "@/shared/ui/Icon";
import { DialogActions } from "@/shared/ui/Dialog";
import { DialogSelect } from "@/shared/ui/DialogSelect";
import type { DialogScopeInfo } from "@/shared/ui/DialogScope";
import type { JobSettingsByType } from "@/features/automation/preferences/automationPreferences";
import { TrainingTemplateEditorDialog } from "./TrainingTemplateEditorDialog";
import { ServiceStatus } from "@/features/automation/components/ServiceStatus";
import { useAiToolkitStatus } from "@/features/automation/hooks/useAiToolkitStatus";

interface PromptRow {
  id: number;
  text: string;
}

interface TrainLoraDialogProps {
  scope: DialogScopeInfo;
  initialSettings: JobSettingsByType["train_lora"];
  busy?: boolean;
  onConfirm: (settings: TrainLoraSettings) => void;
  onCancel: () => void;
}

export function TrainLoraDialog({
  scope,
  initialSettings,
  busy = false,
  onConfirm,
  onCancel,
}: TrainLoraDialogProps) {
  const [model, setModel] = useState<TrainingModel>(initialSettings.model);
  // Never restored: the name is the run's resume key, so it must not attach to an old run.
  const [loraName, setLoraName] = useState("");
  const [triggerWord, setTriggerWord] = useState(initialSettings.trigger_word);
  const initialPrompts = initialSettings.prompts.length
    ? initialSettings.prompts
    : DEFAULT_TRAINING_PROMPTS;
  const [prompts, setPrompts] = useState<PromptRow[]>(() =>
    initialPrompts.map((text, index) => ({ id: index, text })),
  );
  const [error, setError] = useState<string | null>(null);
  const templateDraft = useTrainingTemplateDraft(model);
  const aiToolkit = useAiToolkitStatus();

  // Rows keep their identity across edits so removing one cannot move focus.
  const nextPromptId = useRef(initialPrompts.length);
  const nameRef = useRef<HTMLInputElement>(null);
  const promptsId = useId();
  const errorId = useId();

  const updatePrompt = useCallback((id: number, text: string) => {
    setPrompts((current) => current.map((row) => (row.id === id ? { ...row, text } : row)));
    setError(null);
  }, []);

  const removePrompt = useCallback((id: number) => {
    setPrompts((current) => current.filter((row) => row.id !== id));
    setError(null);
  }, []);

  const addPrompt = useCallback(() => {
    setPrompts((current) => [...current, { id: nextPromptId.current++, text: "" }]);
    setError(null);
  }, []);

  const handleConfirm = useCallback(() => {
    if (busy || aiToolkit !== "ready") return;

    const nameError = validateLoraName(loraName);
    if (nameError) {
      setError(nameError);
      nameRef.current?.focus();
      return;
    }

    const cleanedPrompts = cleanTrainingPrompts(prompts.map((row) => row.text));
    if (cleanedPrompts.length === 0) {
      setError("Add at least one example prompt.");
      return;
    }

    setError(null);
    onConfirm({
      loraName: loraName.trim(),
      triggerWord: triggerWord.trim(),
      prompts: cleanedPrompts,
      model,
      template: templateDraft.template,
    });
  }, [aiToolkit, busy, loraName, model, onConfirm, prompts, templateDraft.template, triggerWord]);

  return (
    <GuardedDialog
      unsavedChanges={
        model !== initialSettings.model ||
        loraName !== "" ||
        triggerWord !== initialSettings.trigger_word ||
        templateDraft.hasDrafts ||
        JSON.stringify(prompts.map((row) => row.text)) !== JSON.stringify(initialPrompts)
      }
      scope={scope}
      icon={jobTypeIconFor("train_lora")}
      title="Start LoRA training?"
      description={<>Trains a {trainingModelLabel(model)} LoRA on them in Ostris AI-Toolkit.</>}
      panelClassName="train-lora-dialog"
      busy={busy}
      confirmDisabled={aiToolkit !== "ready"}
      suspended={templateDraft.editorOpen}
      onConfirm={handleConfirm}
      onClose={onCancel}
      initialFocusRef={nameRef}
      describedById={error || templateDraft.loadError ? errorId : undefined}
      footer={
        <>
          <ServiceStatus service="ai_toolkit" state={aiToolkit} />
          <DialogActions
            confirmLabel="Start training"
            busyLabel="Starting..."
            onCancel={onCancel}
          />
        </>
      }
    >
      <div className="train-lora-dialog__body" data-scroll-lock-allow>
        <DialogSelect
          label="Model"
          value={model}
          options={TRAINING_MODEL_OPTIONS}
          disabled={busy}
          onChange={setModel}
        />

        <div className="train-lora-dialog__template">
          <Button
            icon={iconFilePen}
            onClick={() => void templateDraft.openEditor()}
            disabled={busy || templateDraft.loading}
          >
            {templateDraft.loading ? "Opening..." : "Edit template"}
          </Button>
          {templateDraft.edited ? (
            <span className="train-lora-dialog__template-note train-lora-dialog__template-note--edited">
              <Icon icon={iconTriangleAlert} className="train-lora-dialog__template-note-icon" />
              This run uses your edited template, not the stock one.
            </span>
          ) : (
            <span className="train-lora-dialog__template-note">
              Tweak steps, learning rate or resolution for this run.
            </span>
          )}
        </div>

        <div className="field field-row">
          <Field label="LoRA name">
            {(control) => (
              <TextInput
                {...control}
                ref={nameRef}
                value={loraName}
                onChange={(event) => {
                  setLoraName(event.target.value);
                  setError(null);
                }}
                placeholder="e.g. mountain_style_v1"
                spellCheck={false}
                autoComplete="off"
                disabled={busy}
              />
            )}
          </Field>

          <Field label="Trigger word (optional)">
            {(control) => (
              <TextInput
                {...control}
                value={triggerWord}
                onChange={(event) => setTriggerWord(event.target.value)}
                placeholder="e.g. mtnstyle"
                spellCheck={false}
                autoComplete="off"
                disabled={busy}
              />
            )}
          </Field>
        </div>

        <div className="field train-lora-dialog__prompts-field">
          <div className="train-lora-dialog__prompts-header">
            <span id={promptsId} className="field__label">
              Sample prompts
            </span>
            <Button
              icon={iconPlus}
              className="train-lora-dialog__add-prompt"
              onClick={addPrompt}
              disabled={busy}
              size="xs"
            >
              Add prompt
            </Button>
          </div>

          {prompts.length === 0 ? (
            <p className="train-lora-dialog__prompts-empty">
              AI-Toolkit renders one sample per prompt as the LoRA trains. Add at least one to watch
              it take shape.
            </p>
          ) : (
            <ul
              className="train-lora-dialog__prompts"
              aria-labelledby={promptsId}
              data-scroll-lock-allow
            >
              {prompts.map((row, index) => (
                <li key={row.id} className="train-lora-dialog__prompt">
                  <span className="train-lora-dialog__prompt-index" aria-hidden="true">
                    {index + 1}
                  </span>
                  <input
                    type="text"
                    className="train-lora-dialog__prompt-input"
                    value={row.text}
                    onChange={(event) => updatePrompt(row.id, event.target.value)}
                    placeholder="Describe a sample to generate"
                    aria-label={`Sample prompt ${index + 1}`}
                    autoComplete="off"
                    disabled={busy}
                  />
                  <IconButton
                    icon={iconTrash2}
                    label={`Remove Sample prompt ${index + 1}`}
                    onClick={() => removePrompt(row.id)}
                    disabled={busy}
                    size="xs"
                    variant="ghost"
                    tone="danger"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        {(error || templateDraft.loadError) && (
          <p id={errorId} className="dialog__error" role="alert">
            {error ?? templateDraft.loadError}
          </p>
        )}
      </div>

      {templateDraft.editorOpen && (
        <TrainingTemplateEditorDialog
          model={model}
          initialContent={templateDraft.template ?? templateDraft.stockTemplate}
          stockContent={templateDraft.stockTemplate}
          onClose={templateDraft.closeEditor}
          onApply={templateDraft.applyTemplate}
        />
      )}
    </GuardedDialog>
  );
}
