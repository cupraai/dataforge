import { useId, type ReactNode } from "react";
import type {
  ComfyPresetForm,
  ComfyFormKind,
  ComfyRunMode,
} from "@/features/automation/hooks/useComfyPresetForm";
import type { EmbeddedGenerateWorkflow } from "@/features/automation/types";
import type { ComfyWorkflowMapRequest } from "@/shared/types";
import { Field, TextInput } from "@/shared/ui/Field";
import { ComfyPresetMap } from "./ComfyPresetMap";
import { ComfyPresetSection } from "./ComfyPresetSection";
import { ComfyPromptField } from "./ComfyPromptField";
import { CustomInputField } from "./CustomInputField";

const PROMPT_PLACEHOLDERS: Record<ComfyRunMode, string> = {
  edit: "e.g. sharp studio photograph, no watermark",
  generate: "e.g. a lighthouse on a cliff at dusk",
};

const SEED_PLACEHOLDERS: Record<ComfyRunMode, string> = {
  edit: "e.g. 424242",
  generate: "Random",
};

function EmptyHint({ kind }: { kind: ComfyFormKind }) {
  return kind === "edit" ? (
    <p className="field__hint">
      No presets that edit files found. Export one from ComfyUI with{" "}
      <strong>Save (API Format)</strong> into the <strong>comfy_workflows</strong> folder, titling
      its loader node <strong>DataForge Input</strong>.
    </p>
  ) : (
    <p className="field__hint">
      No workflow presets found. Export one from ComfyUI with <strong>Save (API Format)</strong>{" "}
      into the <strong>comfy_workflows</strong> folder. One whose loader node is titled{" "}
      <strong>DataForge Input</strong> edits files; one without a loader makes new ones.
    </p>
  );
}

const PROMPT_NODE = <strong>DataForge Prompt</strong>;
const SEED_NODE = <strong>DataForge Seed</strong>;

function PromptHint({ mode, blocked }: { mode: ComfyRunMode; blocked: boolean }): ReactNode {
  if (mode === "generate") {
    return blocked ? (
      <>No {PROMPT_NODE} node, so the saved prompt runs.</>
    ) : (
      <>Optional; empty runs the saved prompt.</>
    );
  }
  return blocked ? (
    <>This preset has no {PROMPT_NODE} node, so the saved prompt runs.</>
  ) : (
    <>Optional; written into the preset&apos;s {PROMPT_NODE} node.</>
  );
}

function SeedHint({ mode, blocked }: { mode: ComfyRunMode; blocked: boolean }): ReactNode {
  if (mode === "generate") {
    return blocked ? (
      <>No seed to vary, so every generation runs alike.</>
    ) : (
      <>An empty seed is random each time; a number counts up from there.</>
    );
  }
  return blocked ? (
    <>This preset has no {SEED_NODE} node to take a seed.</>
  ) : (
    <>Optional; written into the preset&apos;s {SEED_NODE} node.</>
  );
}

interface ComfyPresetFieldsProps {
  form: ComfyPresetForm;
  busy: boolean;
  /** Called on every edit, so the dialog can clear a stale error. */
  onEdited: () => void;
  /** Beside the Prompt label, before the saved prompts menu, for an option about the prompt. */
  promptLabelEnd?: ReactNode;
  /** The dialog's own options, under an Output heading below the preset's fields. */
  children?: ReactNode;
  /** A file's own workflow, listed alone in place of the presets. */
  embedded?: EmbeddedGenerateWorkflow;
  /** Why the job cannot start, kept in view at the bottom of the inputs. */
  problem?: ReactNode;
}

/** Presets down the side, the selected one's map in the middle, its inputs on the right. */
export function ComfyPresetFields({
  form,
  busy,
  onEdited,
  promptLabelEnd,
  children,
  embedded,
  problem,
}: ComfyPresetFieldsProps) {
  const promptHintId = useId();
  const seedHintId = useId();
  const { state, preset, mode, draft, promptBlocked, seedBlocked, customInputs, mapInputs } = form;
  const ready = state.status === "ready";
  const mapRequest: ComfyWorkflowMapRequest = embedded
    ? { source: { path: embedded.mediaPath, node_id: embedded.nodeId }, inputs: mapInputs }
    : { preset, inputs: mapInputs };
  const hasPresets = ready && state.presets.length > 0;

  return (
    <div className="comfy-preset-layout">
      <ComfyPresetSection
        title={embedded ? "File workflow" : undefined}
        state={state}
        value={preset}
        removed={form.removed}
        disabled={busy}
        emptyHint={<EmptyHint kind={form.kind} />}
        onChange={(value) => {
          form.selectPreset(value);
          onEdited();
        }}
      >
        {embedded && (
          <p className="field__hint">
            Output <strong>{embedded.branch.label}</strong> of the workflow in{" "}
            <strong>{embedded.mediaName}</strong>. It runs for this job only and is not saved as a
            preset.
          </p>
        )}
      </ComfyPresetSection>

      <section className="comfy-preset-layout__preview" aria-label="Workflow preview">
        <div className="comfy-preset-layout__preview-head">
          <h3 className="comfy-preset-layout__heading">Workflow map</h3>
        </div>
        <div className="comfy-preset-layout__map">
          <div className="comfy-preset-layout__map-scroll">
            {state.status === "loading" && (
              <div className="comfy-preset-map__skeleton" aria-hidden="true" />
            )}
            {hasPresets && preset && (
              <ComfyPresetMap request={mapRequest} saved={embedded ? embedded.branch : undefined} />
            )}
            {ready && !preset && (
              <p className="comfy-preset-map__message">The selected workflow is drawn here.</p>
            )}
          </div>
        </div>
      </section>

      <div className="comfy-preset-layout__form">
        <ComfyPromptField
          value={draft.promptText}
          blocked={promptBlocked}
          placeholder={PROMPT_PLACEHOLDERS[mode]}
          hintId={promptHintId}
          disabled={busy}
          labelEnd={promptLabelEnd}
          onChange={(promptText) => {
            form.updateDraft({ promptText });
            onEdited();
          }}
        />

        <p id={promptHintId} className="field__hint comfy-preset-layout__hint">
          <PromptHint mode={mode} blocked={promptBlocked} />
        </p>

        <fieldset className="comfy-preset-layout__section">
          <div className="field-row comfy-preset-fields__inputs">
            <Field label="Seed">
              {(control) => (
                <TextInput
                  {...control}
                  aria-describedby={seedHintId}
                  type="number"
                  value={seedBlocked ? "" : draft.seedText}
                  onChange={(event) => {
                    form.updateDraft({ seedText: event.target.value });
                    onEdited();
                  }}
                  placeholder={seedBlocked ? "None" : SEED_PLACEHOLDERS[mode]}
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
          <p id={seedHintId} className="field__hint comfy-preset-layout__hint">
            <SeedHint mode={mode} blocked={seedBlocked} />
          </p>
        </fieldset>

        {children && (
          <fieldset className="comfy-preset-layout__section">
            <legend className="comfy-preset-layout__section-label">Output</legend>
            {children}
          </fieldset>
        )}
        {problem}
      </div>
    </div>
  );
}
