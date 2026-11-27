import { useMemo, useState } from "react";
import {
  useComfyPresetList,
  type ComfyPresetKind,
  type PresetsState,
} from "@/features/automation/hooks/useComfyPresets";
import { useListedPreset } from "@/features/automation/hooks/useListedPreset";
import {
  embeddedPresetSummary,
  embeddedWorkflowName,
} from "@/features/automation/lib/embeddedGenerate";
import { inputText, KIND_NOUNS, parseInput } from "@/features/automation/lib/comfyInputs";
import type { EmbeddedGenerateWorkflow } from "@/features/automation/types";
import type {
  ComfyInputValue,
  ComfyRunMode,
  ComfyRunPresetSettings,
  ComfySourceKind,
} from "@/shared/types";

/** A showcase has a form of its own. */
export type ComfyFormKind = Exclude<ComfyPresetKind, "showcase">;

interface PresetMemory {
  preset: string;
  by_preset: Record<string, ComfyRunPresetSettings>;
}

export interface ResolvedPresetValues {
  preset: string;
  /** Null leaves the seed to the job: the preset's own when editing, random when generating. */
  seed: number | null;
  /** Empty runs whatever text the preset's prompt node was saved with. */
  promptText: string;
  /** By custom input name; a name left out runs with the preset's saved value. */
  inputs: Record<string, ComfyInputValue>;
  mode: ComfyRunMode;
  /** What a generation's source loader loads; null runs the workflow without it. */
  startPath: string | null;
}

interface PresetDraft {
  seedText: string;
  promptText: string;
  /** Field text by input name; a boolean holds `"on"`/`"off"`. Empty runs the saved value. */
  inputs: Record<string, string>;
  /** Null lets the preset decide: a source loader edits. */
  mode: ComfyRunMode | null;
  /** Never remembered: a file in one folder rarely starts a run in the next. */
  startPath: string | null;
}

const EMPTY_DRAFT: PresetDraft = {
  seedText: "",
  promptText: "",
  inputs: {},
  mode: null,
  startPath: null,
};

function toDraft(settings: ComfyRunPresetSettings): PresetDraft {
  return {
    seedText: settings.seed == null ? "" : String(settings.seed),
    promptText: settings.prompt_text,
    inputs: Object.fromEntries(
      Object.entries(settings.inputs).map(([name, value]) => [name, inputText(value)]),
    ),
    mode: settings.mode ?? null,
    startPath: null,
  };
}

function sameDraft(a: PresetDraft, b: PresetDraft): boolean {
  const names = new Set([...Object.keys(a.inputs), ...Object.keys(b.inputs)]);
  return (
    a.seedText === b.seedText &&
    a.promptText === b.promptText &&
    a.mode === b.mode &&
    a.startPath === b.startPath &&
    [...names].every((name) => (a.inputs[name] ?? "") === (b.inputs[name] ?? ""))
  );
}

const EMPTY_SEED_MEANING: Record<ComfyRunMode, string> = {
  edit: "or empty to use the preset's own",
  generate: "or empty for a random seed",
};

/** A file's own workflow starts from the prompt it was made with; nothing else is remembered. */
function embeddedMemory(embedded: EmbeddedGenerateWorkflow): PresetMemory {
  const name = embeddedWorkflowName(embedded);
  return {
    preset: name,
    by_preset: {
      [name]: { seed: null, prompt_text: embedded.generation.prompt_text ?? "", inputs: {} },
    },
  };
}

/**
 * Preset, prompt, seed and inputs for Run ComfyUI workflow, drafted per preset.
 * With `embedded`, the file's own workflow is the only choice.
 */
export function useComfyPresetForm(
  remembered: PresetMemory,
  kind: ComfyFormKind,
  embedded?: EmbeddedGenerateWorkflow,
) {
  const initial = useMemo(
    () => (embedded ? embeddedMemory(embedded) : remembered),
    [embedded, remembered],
  );
  const listed = useComfyPresetList(kind);
  const state: PresetsState =
    embedded && listed.status === "ready"
      ? { ...listed, presets: [embeddedPresetSummary(embedded)] }
      : listed;
  const [chosenPreset, setChosenPreset] = useState(initial.preset);
  const loadedPresets = state.status === "ready" ? state.presets : undefined;
  const names = loadedPresets?.map((entry) => entry.name);
  const opened = useListedPreset(names, initial.preset);
  const { preset, target, removed } = useListedPreset(names, chosenPreset);
  const [drafts, setDrafts] = useState<Record<string, PresetDraft>>(() =>
    Object.fromEntries(
      Object.entries(initial.by_preset).map(([name, saved]) => [name, toDraft(saved)]),
    ),
  );
  const draft = drafts[target] ?? EMPTY_DRAFT;
  const updateDraft = (patch: Partial<PresetDraft>) =>
    setDrafts((current) => ({
      ...current,
      [target]: { ...(current[target] ?? EMPTY_DRAFT), ...patch },
    }));

  const selected = loadedPresets?.find((entry) => entry.name === preset) ?? null;
  // Only a preset with a source loader can edit, and it can generate from a start file too. An
  // unparseable one may be either, and reads as editing: queueing it names the fix either way.
  let selectedMode: ComfyRunMode | null = null;
  if (embedded) selectedMode = "generate";
  else if (kind === "edit") selectedMode = "edit";
  else if (selected) selectedMode = selected.generates ? "generate" : (draft.mode ?? "edit");
  // With none selected, as when the chosen one is removed, the form keeps the last one's shape.
  const [lastMode, setLastMode] = useState<ComfyRunMode>(selectedMode ?? "edit");
  if (selectedMode !== null && selectedMode !== lastMode) setLastMode(selectedMode);
  const mode = selectedMode ?? lastMode;
  const loads: ComfySourceKind | null = embedded
    ? (embedded.generation.source_kind ?? null)
    : (selected?.source_kind ?? null);
  /** What a generation's start file is, when it takes one. */
  const startKind = mode === "generate" ? loads : null;
  const startPath = startKind ? draft.startPath : null;
  // Only false blocks: a preset that could not be parsed reports null and keeps both fields live.
  const promptBlocked = selected?.accepts_prompt === false;
  // An edit never seeds an untitled sampler; a generation from a start file does.
  const seedBlocked =
    (startKind && !embedded ? selected?.accepts_generation_seed : selected?.accepts_seed) === false;
  const customInputs = selected?.inputs ?? [];
  const mapInputs: Record<string, ComfyInputValue> = {};
  for (const input of customInputs) {
    const value = parseInput(input, draft.inputs[input.name] ?? "");
    if (value !== undefined && value !== null) mapInputs[input.name] = value;
  }

  const changed =
    target !== opened.target ||
    Object.entries(drafts).some(([name, entry]) => {
      const saved = initial.by_preset[name];
      return !sameDraft(entry, saved ? toDraft(saved) : EMPTY_DRAFT);
    });

  /** What to send, or the message naming the first field that does not parse. */
  const resolve = (): { values: ResolvedPresetValues } | { error: string } => {
    if (!preset) return { error: "Choose a workflow preset." };

    const seedText = draft.seedText.trim();
    if (seedText && !/^\d+$/.test(seedText)) {
      return { error: `The seed must be a whole number, ${EMPTY_SEED_MEANING[mode]}.` };
    }

    // Only the selected preset's inputs: a remembered name its file no longer has is dropped.
    const inputs: Record<string, ComfyInputValue> = {};
    for (const input of customInputs) {
      const value = parseInput(input, draft.inputs[input.name] ?? "");
      if (value === undefined) {
        return {
          error: `${input.name} must be ${KIND_NOUNS[input.kind]}, or empty to use the preset's own.`,
        };
      }
      if (value !== null) inputs[input.name] = value;
    }

    return {
      values: {
        preset,
        seed: seedBlocked || !seedText ? null : Number(seedText),
        promptText: promptBlocked ? "" : draft.promptText.trim(),
        inputs,
        mode,
        startPath,
      },
    };
  };

  return {
    kind,
    state,
    preset,
    mode,
    /** Only a preset with a source loader edits; a file's own workflow never does. */
    canEdit: !embedded && selected?.generates !== true,
    /** A workflow step only edits. */
    canGenerate: kind === "run",
    chooseMode: (next: ComfyRunMode) => updateDraft({ mode: next }),
    /** What a generation loads as its start file; null when it takes none. */
    startKind,
    startPath,
    chooseStartPath: (next: string | null) => updateDraft({ startPath: next }),
    /** The selected preset's name once it has left the list; nothing is selected then. */
    removed,
    selectPreset: setChosenPreset,
    draft,
    updateDraft,
    promptBlocked,
    seedBlocked,
    customInputs,
    /** The inputs whose text parses, for drawing the map; the rest are drawn as saved. */
    mapInputs,
    changed,
    resolve,
  };
}

export type ComfyPresetForm = ReturnType<typeof useComfyPresetForm>;
