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
import type { ComfyPresetInput, ComfyPresetSummary, GalleryItem } from "@/shared/types";
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
  const update = (index: number, patch: Partial<LoraRowDraft>) =>
    onChange(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));

  return (
    <fieldset className="comfy-preset-layout__section">
      <legend className="comfy-preset-layout__section-label">More LoRAs</legend>
      {rows.length === 0 ? (
        <p className="field__hint comfy-showcase__note">
          This item only runs with the showcased LoRA.
        </p>
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
      <Button
        icon={iconPlus}
        size="xs"
        className="comfy-showcase__add"
        disabled={disabled || rows.length >= MAX_SHOWCASE_ITEM_LORAS}
        onClick={() => onChange([...rows, blankLoraRow()])}
      >
        Add LoRA
      </Button>
    </fieldset>
  );
}

interface InputFieldsProps {
  inputs: readonly ComfyPresetInput[];
  texts: Record<string, string>;
  disabled: boolean;
  onChange: (texts: Record<string, string>) => void;
}

function InputFields({ inputs, texts, disabled, onChange }: InputFieldsProps) {
  return (
    <div className="field-row comfy-preset-fields__inputs">
      {inputs.map((input) => (
        <CustomInputField
          key={input.name}
          input={input}
          text={texts[input.name] ?? ""}
          disabled={disabled}
          onChange={(text) => onChange({ ...texts, [input.name]: text })}
        />
      ))}
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

/** The selected item, laid out like Generate's form: the prompt takes the spare height. */
export function ShowcaseItemForm({
  state,
  index,
  preset,
  loras,
  folderItems,
  disabled,
}: ItemFormProps) {
  const promptHintId = useId();
  const seedHintId = useId();
  const item = state.draft.items[index];
  if (!item) return null;

  const change = (patch: Partial<ItemDraft>) => state.updateItem(index, patch);
  // Only false blocks: a preset that could not be parsed reports null and keeps both fields live.
  const promptBlocked = preset?.accepts_prompt === false;
  const seedBlocked = preset?.accepts_showcase_seed === false;

  return (
    <>
      <ComfyPromptField
        value={item.promptText}
        blocked={promptBlocked}
        placeholder="e.g. a lighthouse on a cliff at dusk"
        hintId={promptHintId}
        disabled={disabled}
        labelEnd={
          <Checkbox
            className="comfy-run-dialog__caption"
            label="Save as caption"
            checked={state.draft.captionFromPrompt && !promptBlocked}
            disabled={disabled || promptBlocked}
            onChange={(captionFromPrompt) => state.update({ captionFromPrompt })}
          />
        }
        onChange={(promptText) => change({ promptText })}
      />

      <p id={promptHintId} className="field__hint comfy-preset-layout__hint">
        {promptBlocked
          ? "No DataForge Prompt node, so the saved prompt runs."
          : "Empty runs the preset's own prompt."}
      </p>

      <div className="comfy-preset-layout__section">
        <div className="field-row comfy-showcase__fields">
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
          <Field label="Seed">
            {(control) => (
              <TextInput
                {...control}
                aria-describedby={seedHintId}
                type="number"
                value={seedBlocked ? "" : item.seedText}
                placeholder={seedBlocked ? "None" : "Random"}
                autoComplete="off"
                disabled={disabled || seedBlocked}
                onChange={(event) => change({ seedText: event.target.value })}
              />
            )}
          </Field>
        </div>
        <p id={seedHintId} className="field__hint comfy-preset-layout__hint">
          {seedBlocked ? "No seed to vary." : "An empty seed is random, alike for every LoRA."}
        </p>
      </div>

      {preset?.source_kind && (
        <fieldset className="comfy-preset-layout__section">
          <legend className="comfy-preset-layout__section-label">
            Start {preset.source_kind} (optional)
          </legend>
          <StartFilePicker
            kind={preset.source_kind}
            value={item.sourcePath}
            items={folderItems}
            disabled={disabled}
            onChange={(sourcePath) => change({ sourcePath })}
          />
        </fieldset>
      )}

      <LoraRows
        rows={item.loras}
        options={loras}
        disabled={disabled}
        onChange={(rows) => change({ loras: rows })}
      />

      {preset && preset.inputs.length > 0 && (
        <fieldset className="comfy-preset-layout__section">
          <InputFields
            inputs={preset.inputs}
            texts={item.inputs}
            disabled={disabled}
            onChange={(inputs) => change({ inputs })}
          />
        </fieldset>
      )}
    </>
  );
}
