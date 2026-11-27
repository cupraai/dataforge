import { useId, type ReactNode } from "react";
import type {
  ComfyPresetForm,
  ComfyFormKind,
} from "@/features/automation/hooks/useComfyPresetForm";
import type { EmbeddedGenerateWorkflow } from "@/features/automation/types";
import type { ComfyRunMode, ComfyWorkflowMapRequest } from "@/shared/types";
import { Field, TextInput } from "@/shared/ui/Field";
import { ComfyPresetMap } from "./ComfyPresetMap";
import { ComfyPresetSection } from "./ComfyPresetSection";
import { ComfyPromptField } from "./ComfyPromptField";
import { CustomInputField } from "./CustomInputField";

/** The example first, then what an empty field runs. */
const PROMPT_PLACEHOLDERS: Record<ComfyRunMode, string> = {
  edit: "e.g. sharp studio photograph, no watermark\nEmpty runs the saved prompt.",
  generate: "e.g. a lighthouse on a cliff at dusk\nEmpty runs the saved prompt.",
};

const SEED_PLACEHOLDERS: Record<ComfyRunMode, string> = {
  edit: "Preset's own",
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
      into the <strong>comfy_workflows</strong> folder. One that loads an image or video can edit
      files or make new ones from a start file; one without a loader makes new ones.
    </p>
  );
}

/** Why a field the run dialog leaves out is missing; one short line each. */
function missingFieldNotes(form: ComfyPresetForm): string[] {
  const notes: string[] = [];
  if (form.promptBlocked) notes.push("Runs its saved prompt: no DataForge Prompt node.");
  if (form.seedBlocked) {
    notes.push(
      form.mode === "generate"
        ? "No seed to vary, so every generation runs alike."
        : "Runs its saved seeds: no DataForge Seed node.",
    );
  }
  return notes;
}

/** The prompt, seed and start file the map draws in place of the saved ones; none left out. */
function mapRunValues(
  form: ComfyPresetForm,
  embedded: EmbeddedGenerateWorkflow | undefined,
): Pick<ComfyWorkflowMapRequest, "prompt_text" | "seed" | "start_path"> {
  const promptText = form.promptBlocked ? "" : form.draft.promptText.trim();
  const seedText = form.seedBlocked ? "" : form.draft.seedText.trim();
  // A file's own workflow opens on its saved prompt, which its saved map already draws.
  const savedPrompt = embedded?.generation.prompt_text?.trim() ?? "";
  return {
    ...(promptText && promptText !== savedPrompt && { prompt_text: promptText }),
    ...(/^\d+$/.test(seedText) && { seed: Number(seedText) }),
    ...(form.startPath && { start_path: form.startPath }),
  };
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
  /** Above the inputs: what the run does, which the fields below follow. */
  modeControl?: ReactNode;
  /** A start file picker, in a row of its own after the other inputs. */
  startFile?: ReactNode;
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
  modeControl,
  startFile,
  embedded,
  problem,
}: ComfyPresetFieldsProps) {
  const inputsId = useId();
  const outputId = useId();
  const { state, preset, mode, draft, promptBlocked, seedBlocked, customInputs, mapInputs } = form;
  const ready = state.status === "ready";
  // Drawn as it will run: what is typed replaces the saved values, as the job writes them.
  const mapRequest: ComfyWorkflowMapRequest = {
    ...(embedded
      ? { source: { path: embedded.mediaPath, node_id: embedded.nodeId } }
      : // Only a generation draws the source loader as its start file; a file's own always does.
        { preset, ...(form.startKind && { mode: "generate" as const }) }),
    inputs: mapInputs,
    ...mapRunValues(form, embedded),
  };
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

      <div className="comfy-preset-layout__form comfy-form">
        {modeControl}

        <div
          className="comfy-form__pane comfy-form__pane--grow"
          role="group"
          aria-labelledby={inputsId}
        >
          <h3 id={inputsId} className="comfy-preset-layout__heading">
            Inputs
          </h3>
          {!promptBlocked && (
            <ComfyPromptField
              value={draft.promptText}
              blocked={false}
              placeholder={PROMPT_PLACEHOLDERS[mode]}
              disabled={busy}
              labelEnd={promptLabelEnd}
              onChange={(promptText) => {
                form.updateDraft({ promptText });
                onEdited();
              }}
            />
          )}

          {(!seedBlocked || customInputs.length > 0) && (
            <div className="field-row comfy-preset-fields__inputs">
              {!seedBlocked && (
                <Field label="Seed">
                  {(control) => (
                    <TextInput
                      {...control}
                      type="number"
                      value={draft.seedText}
                      onChange={(event) => {
                        form.updateDraft({ seedText: event.target.value });
                        onEdited();
                      }}
                      placeholder={SEED_PLACEHOLDERS[mode]}
                      spellCheck={false}
                      autoComplete="off"
                      disabled={busy}
                    />
                  )}
                </Field>
              )}
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
          )}

          {startFile && <div className="field comfy-preset-fields__start">{startFile}</div>}

          {missingFieldNotes(form).length > 0 && (
            <ul className="comfy-form__notes">
              {missingFieldNotes(form).map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </div>

        {children && (
          <div className="comfy-form__pane" role="group" aria-labelledby={outputId}>
            <h3 id={outputId} className="comfy-preset-layout__heading">
              Output
            </h3>
            {children}
          </div>
        )}
        {problem}
      </div>
    </div>
  );
}
