import { useId, useRef, type ReactNode } from "react";
import type {
  ComfyPresetForm,
  ComfyPresetKind,
} from "@/features/automation/hooks/useComfyPresetForm";
import { appendSnippet } from "@/features/automation/lib/appendSnippet";
import type { EmbeddedGenerateWorkflow } from "@/features/automation/types";
import { iconLoader2, iconTriangleAlert } from "@/shared/icons";
import { classNames } from "@/shared/lib/classNames";
import type { ComfyPresetInput, ComfyPresetSummary, ComfyWorkflowMapRequest } from "@/shared/types";
import { DialogSelect } from "@/shared/ui/DialogSelect";
import { Field, TextArea, TextInput } from "@/shared/ui/Field";
import { Icon } from "@/shared/ui/Icon";
import { ComfyPresetMap } from "./ComfyPresetMap";
import { SavedSnippetMenu } from "./SavedSnippetMenu";

type BooleanChoice = "" | "on" | "off";

const PROMPT_PLACEHOLDERS: Record<ComfyPresetKind, string> = {
  edit: "e.g. sharp studio photograph, no watermark",
  generate: "e.g. a lighthouse on a cliff at dusk",
};

const SEED_PLACEHOLDERS: Record<ComfyPresetKind, string> = {
  edit: "e.g. 424242",
  generate: "Random",
};

function EmptyHint({ kind }: { kind: ComfyPresetKind }) {
  return kind === "generate" ? (
    <p className="field__hint">
      No generation presets found. Export a workflow without a source loader from ComfyUI with{" "}
      <strong>Save (API Format)</strong> into the <strong>comfy_workflows</strong> folder.
    </p>
  ) : (
    <p className="field__hint">
      No workflow presets found. Export one from ComfyUI with <strong>Save (API Format)</strong>{" "}
      into the <strong>comfy_workflows</strong> folder, titling its loader node{" "}
      <strong>DataForge Input</strong>.
    </p>
  );
}

function NodeHint({
  kind,
  promptBlocked,
  seedBlocked,
}: {
  kind: ComfyPresetKind;
  promptBlocked: boolean;
  seedBlocked: boolean;
}): ReactNode {
  const prompt = <strong>DataForge Prompt</strong>;

  if (kind === "generate") {
    if (promptBlocked && seedBlocked) {
      return <>No {prompt} node or seed, so every generation runs exactly as saved.</>;
    }
    if (promptBlocked) {
      return <>No {prompt} node, so the saved prompt runs. An empty seed is random each time.</>;
    }
    if (seedBlocked) {
      return <>The prompt is optional. No seed to vary, so every generation runs alike.</>;
    }
    return <>Both optional. An empty seed is random each time; a number counts up from there.</>;
  }

  const seedNode = <strong>DataForge Seed</strong>;
  if (promptBlocked && seedBlocked) {
    return (
      <>
        This preset has neither a {prompt} nor a {seedNode} node, so it runs exactly as saved.
      </>
    );
  }
  if (promptBlocked) {
    return (
      <>
        This preset has no {prompt} node. The seed is optional and is written into its {seedNode}{" "}
        node.
      </>
    );
  }
  if (seedBlocked) {
    return (
      <>
        This preset has no {seedNode} node. The prompt is optional and is written into its {prompt}{" "}
        node.
      </>
    );
  }
  return (
    <>
      Both optional; written into the preset&apos;s {prompt} and {seedNode} nodes.
    </>
  );
}

/** Whether ComfyUI answered when the presets were listed; the job only needs it later. */
function ComfyStatus({ available, baseUrl }: { available: boolean; baseUrl: string }) {
  return available ? (
    <span className="comfy-preset-layout__status" title={baseUrl}>
      <span className="comfy-preset-layout__status-dot" aria-hidden="true" />
      ComfyUI ready
    </span>
  ) : (
    <p className="comfy-preset-layout__status comfy-preset-layout__status--offline" role="alert">
      <Icon icon={iconTriangleAlert} className="comfy-preset-layout__status-icon" />
      <span>
        ComfyUI is not answering at <strong>{baseUrl}</strong>. Start it before the job begins, or
        point <strong>COMFY_BASE_URL</strong> at the port it listens on.
      </span>
    </p>
  );
}

/** What a preset takes from the dialog, so the list says it before the preset is chosen. */
function presetTakes(entry: ComfyPresetSummary): string {
  if (entry.generates === null) return "Could not be read";
  const parts: string[] = [];
  if (entry.accepts_prompt) parts.push("Prompt");
  if (entry.accepts_seed) parts.push("Seed");
  if (entry.inputs.length > 0) {
    parts.push(entry.inputs.length === 1 ? "1 input" : `${entry.inputs.length} inputs`);
  }
  return parts.length > 0 ? parts.join(" · ") : "Runs as saved";
}

interface PresetListProps {
  presets: readonly ComfyPresetSummary[];
  value: string;
  labelledById: string;
  disabled: boolean;
  onChange: (name: string) => void;
}

/** Every preset at once, with what each one takes, instead of a select that hides the rest. */
function PresetList({ presets, value, labelledById, disabled, onChange }: PresetListProps) {
  const name = useId();
  return (
    <div className="comfy-preset-list" role="radiogroup" aria-labelledby={labelledById}>
      {presets.map((entry, index) => {
        const checked = entry.name === value;
        const metaId = `${name}-${index}`;
        return (
          <label
            key={entry.name}
            className={classNames(
              "comfy-preset-list__item",
              checked && "comfy-preset-list__item--current",
            )}
          >
            <input
              type="radio"
              className="comfy-preset-list__radio"
              name={name}
              value={entry.name}
              checked={checked}
              disabled={disabled}
              // The visible text runs name and meta together; the meta is the description.
              aria-label={entry.name}
              aria-describedby={metaId}
              onChange={() => onChange(entry.name)}
            />
            {/* Truncated in the narrow column, so the whole name is a hover away. */}
            <span className="comfy-preset-list__name" title={entry.name}>
              {entry.name}
            </span>
            <span
              id={metaId}
              className={classNames(
                "comfy-preset-list__meta",
                entry.generates === null && "comfy-preset-list__meta--problem",
              )}
            >
              {presetTakes(entry)}
            </span>
          </label>
        );
      })}
    </div>
  );
}

interface ComfyPresetFieldsProps {
  form: ComfyPresetForm;
  kind: ComfyPresetKind;
  busy: boolean;
  /** Called on every edit, so the dialog can clear a stale error. */
  onEdited: () => void;
  /** Beside the Prompt label, before the saved prompts menu, for an option about the prompt. */
  promptLabelEnd?: ReactNode;
  /** The dialog's own options, under an Output heading below the preset's fields. */
  children?: ReactNode;
  /** A file's own workflow, listed alone in place of the presets. */
  embedded?: EmbeddedGenerateWorkflow;
}

/** Presets down the side, the selected one's map in the middle, its inputs on the right. */
export function ComfyPresetFields({
  form,
  kind,
  busy,
  onEdited,
  promptLabelEnd,
  children,
  embedded,
}: ComfyPresetFieldsProps) {
  const nodeHintId = useId();
  const presetsId = useId();
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const { state, preset, draft, promptBlocked, seedBlocked, customInputs, mapInputs } = form;
  const ready = state.status === "ready";
  const mapRequest: ComfyWorkflowMapRequest = embedded
    ? { source: { path: embedded.mediaPath, node_id: embedded.nodeId }, inputs: mapInputs }
    : { preset, inputs: mapInputs };
  const hasPresets = ready && state.presets.length > 0;

  return (
    <div className="comfy-preset-layout">
      <section className="comfy-preset-layout__presets" aria-labelledby={presetsId}>
        <h3 id={presetsId} className="comfy-preset-layout__heading">
          {embedded ? "File workflow" : "Workflow presets"}
        </h3>
        {state.status === "loading" && (
          <p className="comfy-preset-fields__loading" role="status">
            <Icon icon={iconLoader2} spin className="comfy-preset-fields__loading-icon" />
            Loading workflow presets...
          </p>
        )}
        {state.status === "error" && (
          <p className="dialog__error" role="alert">
            Could not load workflow presets. {state.message}
          </p>
        )}
        {ready && state.presets.length === 0 && <EmptyHint kind={kind} />}
        {hasPresets && (
          <PresetList
            presets={state.presets}
            value={preset}
            labelledById={presetsId}
            disabled={busy}
            onChange={(value) => {
              form.selectPreset(value);
              onEdited();
            }}
          />
        )}
        {embedded && (
          <p className="field__hint">
            Output <strong>{embedded.branch.label}</strong> of the workflow in{" "}
            <strong>{embedded.mediaName}</strong>. It runs for this job only and is not saved as a
            preset.
          </p>
        )}
      </section>

      <section className="comfy-preset-layout__preview" aria-label="Workflow preview">
        <div className="comfy-preset-layout__preview-head">
          <h3 className="comfy-preset-layout__heading">Workflow map</h3>
          {ready && <ComfyStatus available={state.available} baseUrl={state.baseUrl} />}
        </div>
        <div className="comfy-preset-layout__map">
          <div className="comfy-preset-layout__map-scroll">
            {state.status === "loading" && (
              <div className="comfy-preset-map__skeleton" aria-hidden="true" />
            )}
            {hasPresets && (
              <ComfyPresetMap request={mapRequest} saved={embedded ? embedded.branch : undefined} />
            )}
            {ready && state.presets.length === 0 && (
              <p className="comfy-preset-map__message">The selected workflow is drawn here.</p>
            )}
          </div>
        </div>
      </section>

      <div className="comfy-preset-layout__form">
        <Field
          label="Prompt"
          labelEnd={
            <>
              {promptLabelEnd}
              <SavedSnippetMenu
                book="comfy_prompts"
                text={promptBlocked ? "" : draft.promptText}
                disabled={busy || promptBlocked}
                onInsert={(text) => {
                  form.updateDraft({ promptText: appendSnippet(draft.promptText, text) });
                  onEdited();
                  promptRef.current?.focus();
                }}
              />
            </>
          }
          className="comfy-preset-layout__prompt"
        >
          {(control) => (
            <TextArea
              {...control}
              ref={promptRef}
              aria-describedby={nodeHintId}
              rows={4}
              value={promptBlocked ? "" : draft.promptText}
              onChange={(event) => {
                form.updateDraft({ promptText: event.target.value });
                onEdited();
              }}
              placeholder={
                promptBlocked ? "This preset has no prompt node" : PROMPT_PLACEHOLDERS[kind]
              }
              disabled={busy || promptBlocked}
            />
          )}
        </Field>

        <p id={nodeHintId} className="field__hint comfy-preset-layout__hint">
          <NodeHint kind={kind} promptBlocked={promptBlocked} seedBlocked={seedBlocked} />
        </p>

        <fieldset className="comfy-preset-layout__section">
          <legend className="comfy-preset-layout__section-label">Workflow inputs</legend>
          <div className="field-row comfy-preset-fields__inputs">
            <Field label="Seed">
              {(control) => (
                <TextInput
                  {...control}
                  aria-describedby={nodeHintId}
                  type="number"
                  value={seedBlocked ? "" : draft.seedText}
                  onChange={(event) => {
                    form.updateDraft({ seedText: event.target.value });
                    onEdited();
                  }}
                  placeholder={seedBlocked ? "None" : SEED_PLACEHOLDERS[kind]}
                  spellCheck={false}
                  autoComplete="off"
                  disabled={busy || seedBlocked}
                />
              )}
            </Field>
            {customInputs.map((input) => (
              <CustomInputField
                key={input.name}
                input={input}
                text={draft.inputs[input.name] ?? ""}
                disabled={busy}
                onChange={(text) => {
                  form.updateDraft({ inputs: { ...draft.inputs, [input.name]: text } });
                  onEdited();
                }}
              />
            ))}
          </div>
        </fieldset>

        {children && (
          <fieldset className="comfy-preset-layout__section">
            <legend className="comfy-preset-layout__section-label">Output</legend>
            {children}
          </fieldset>
        )}
      </div>
    </div>
  );
}

interface CustomInputFieldProps {
  input: ComfyPresetInput;
  text: string;
  disabled: boolean;
  onChange: (text: string) => void;
}

/** One `DataForge <name>` node; the saved value is the placeholder an empty field runs with. */
function CustomInputField({ input, text, disabled, onChange }: CustomInputFieldProps) {
  if (input.kind === "boolean") {
    return (
      <DialogSelect<BooleanChoice>
        label={input.name}
        value={text === "on" || text === "off" ? text : ""}
        options={[
          { value: "", title: `Default (${input.default ? "on" : "off"})` },
          { value: "on", title: "On" },
          { value: "off", title: "Off" },
        ]}
        disabled={disabled}
        onChange={onChange}
      />
    );
  }

  const numeric = input.kind !== "text";
  return (
    <Field label={input.name} className={numeric ? undefined : "comfy-preset-fields__cell--wide"}>
      {(control) => (
        <TextInput
          {...control}
          type={numeric ? "number" : "text"}
          step={input.kind === "integer" ? 1 : numeric ? "any" : undefined}
          value={text}
          onChange={(event) => onChange(event.target.value)}
          placeholder={String(input.default)}
          spellCheck={false}
          autoComplete="off"
          disabled={disabled}
        />
      )}
    </Field>
  );
}
