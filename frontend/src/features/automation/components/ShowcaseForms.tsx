import { useId } from "react";
import { ComfyPromptField } from "@/features/automation/components/ComfyPromptField";
import { CustomInputField } from "@/features/automation/components/CustomInputField";
import { StartFilePicker } from "@/features/automation/components/StartFilePicker";
import {
  blankLoraRow,
  type ItemDraft,
  type LoraRowDraft,
  type ShowcaseDraftState,
} from "@/features/automation/hooks/useShowcaseDraft";
import { describeLora } from "@/features/automation/lib/showcase";
import { MAX_SHOWCASE_ITEM_LORAS, MAX_SHOWCASE_LABEL_LENGTH } from "@/shared/constants";
import { iconPlus, iconTrash2 } from "@/shared/icons";
import type { ComfyPresetSummary, GalleryItem } from "@/shared/types";
import { Button } from "@/shared/ui/Button";
import { Checkbox } from "@/shared/ui/Checkbox";
import { Field, TextInput } from "@/shared/ui/Field";
import { IconButton } from "@/shared/ui/IconButton";
import { SearchSelect, type SearchSelectOption } from "@/shared/ui/SearchSelect";

interface LoraRowsProps {
  rows: readonly LoraRowDraft[];
  options: SearchSelectOption[];
  disabled: boolean;
  onChange: (rows: LoraRowDraft[]) => void;
}

/** The item's own LoRAs, chained after the one showcased. */
function LoraRows({ rows, options, disabled, onChange }: LoraRowsProps) {
  const headingId = useId();
  const update = (index: number, patch: Partial<LoraRowDraft>) =>
    onChange(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));

  return (
    <div className="comfy-form__pane" role="group" aria-labelledby={headingId}>
      <div className="comfy-form__pane-head">
        <h3 id={headingId} className="comfy-preset-layout__heading">
          More LoRAs
        </h3>
        <Button
          icon={iconPlus}
          size="xs"
          disabled={disabled || rows.length >= MAX_SHOWCASE_ITEM_LORAS}
          onClick={() => onChange([...rows, blankLoraRow()])}
        >
          Add LoRA
        </Button>
      </div>
      {rows.length === 0 ? (
        <ul className="comfy-form__notes">
          <li>Only the showcased LoRA runs for this item.</li>
        </ul>
      ) : (
        <ul className="comfy-showcase__loras">
          {rows.map((row, index) => (
            <li key={row.key} className="comfy-showcase__lora-row">
              <Checkbox
                className="comfy-showcase__lora-toggle"
                label={<span className="comfy-showcase__hidden">Use LoRA {index + 1}</span>}
                checked={row.enabled}
                disabled={disabled}
                onChange={(enabled) => update(index, { enabled })}
              />
              <SearchSelect
                label="LoRAs"
                options={options}
                selected={row.name ? [row.name] : []}
                onPick={(name) => update(index, { name })}
                triggerLabel={row.name ? describeLora(row.name).stem : "Choose a LoRA"}
                triggerAriaLabel={`LoRA ${index + 1}: ${row.name || "none"}`}
                triggerClassName="comfy-showcase__wide-trigger"
                emptyText="ComfyUI lists no LoRA by that name."
                disabled={disabled}
              />
              <TextInput
                size="sm"
                type="number"
                step="0.05"
                className="comfy-showcase__strength"
                aria-label={`Strength of LoRA ${index + 1}`}
                value={row.strengthText}
                disabled={disabled}
                onChange={(event) => update(index, { strengthText: event.target.value })}
              />
              <IconButton
                icon={iconTrash2}
                label={`Remove LoRA ${index + 1}`}
                size="xs"
                variant="ghost"
                tone="danger"
                disabled={disabled}
                onClick={() => onChange(rows.filter((_, at) => at !== index))}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface FormProps {
  state: ShowcaseDraftState;
  preset: ComfyPresetSummary | null;
  disabled: boolean;
}

interface ItemFormProps extends FormProps {
  index: number;
  loras: SearchSelectOption[];
  folderItems: readonly GalleryItem[];
}

/** Why a field the item form leaves out is missing; one short line each. */
function missingFieldNotes(promptBlocked: boolean, seedBlocked: boolean): string[] {
  return [
    ...(promptBlocked ? ["Runs its saved prompt: no DataForge Prompt node."] : []),
    ...(seedBlocked ? ["No seed to vary, so every render runs alike."] : []),
  ];
}

/**
 * The selected item, framed like Run ComfyUI workflow's inputs: the prompt takes the spare
 * height, the values share one grid, the start file has a row of its own, and the item's extra
 * LoRAs follow in a pane of their own.
 */
export function ShowcaseItemForm({
  state,
  index,
  preset,
  loras,
  folderItems,
  disabled,
}: ItemFormProps) {
  const itemId = useId();
  const item = state.draft.items[index];
  if (!item) return null;

  const change = (patch: Partial<ItemDraft>) => state.updateItem(index, patch);
  // Only false blocks: a preset that could not be parsed reports null and keeps both fields live.
  const promptBlocked = preset?.accepts_prompt === false;
  const seedBlocked = preset?.accepts_generation_seed === false;
  const notes = missingFieldNotes(promptBlocked, seedBlocked);

  return (
    <>
      <div
        className="comfy-form__pane comfy-form__pane--grow"
        role="group"
        aria-labelledby={itemId}
      >
        <h3 id={itemId} className="comfy-preset-layout__heading">
          Item {index + 1}
        </h3>
        {!promptBlocked && (
          <ComfyPromptField
            value={item.promptText}
            blocked={false}
            placeholder={"e.g. a lighthouse on a cliff at dusk\nEmpty runs the saved prompt."}
            disabled={disabled}
            labelEnd={
              <Checkbox
                className="comfy-run-dialog__caption"
                label="Save as caption"
                checked={state.draft.captionFromPrompt}
                disabled={disabled}
                onChange={(captionFromPrompt) => state.update({ captionFromPrompt })}
              />
            }
            onChange={(promptText) => change({ promptText })}
          />
        )}

        <div className="field-row comfy-preset-fields__inputs">
          <Field label="Label">
            {(control) => (
              <TextInput
                {...control}
                value={item.label}
                maxLength={MAX_SHOWCASE_LABEL_LENGTH}
                placeholder={state.titleOf(index)}
                autoComplete="off"
                disabled={disabled}
                onChange={(event) => change({ label: event.target.value })}
              />
            )}
          </Field>
          <Field label="Strength">
            {(control) => (
              <TextInput
                {...control}
                type="number"
                step="0.05"
                value={item.strengthText}
                disabled={disabled}
                onChange={(event) => change({ strengthText: event.target.value })}
              />
            )}
          </Field>
          {!seedBlocked && (
            <Field label="Seed">
              {(control) => (
                <TextInput
                  {...control}
                  type="number"
                  value={item.seedText}
                  placeholder="Random"
                  autoComplete="off"
                  disabled={disabled}
                  onChange={(event) => change({ seedText: event.target.value })}
                />
              )}
            </Field>
          )}
          {preset?.inputs.map((input) => (
            <CustomInputField
              key={input.name}
              input={input}
              text={item.inputs[input.name] ?? ""}
              disabled={disabled}
              onChange={(text) => change({ inputs: { ...item.inputs, [input.name]: text } })}
            />
          ))}
        </div>

        {preset?.source_kind && (
          <div className="field comfy-preset-fields__start">
            <span className="field__label">Start {preset.source_kind} (optional)</span>
            <StartFilePicker
              kind={preset.source_kind}
              value={item.sourcePath}
              items={folderItems}
              disabled={disabled}
              onChange={(sourcePath) => change({ sourcePath })}
            />
          </div>
        )}

        {notes.length > 0 && (
          <ul className="comfy-form__notes">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
      </div>

      <LoraRows
        rows={item.loras}
        options={loras}
        disabled={disabled}
        onChange={(rows) => change({ loras: rows })}
      />
    </>
  );
}
