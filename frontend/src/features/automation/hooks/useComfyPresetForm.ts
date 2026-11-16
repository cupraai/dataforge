import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { comfyPresetsQueryOptions } from "@/features/automation/lib/automationQueries";
import {
  embeddedPresetSummary,
  embeddedWorkflowName,
} from "@/features/automation/lib/embeddedGenerate";
import type { EmbeddedGenerateWorkflow } from "@/features/automation/types";
import { formatApiError } from "@/shared/api/http";
import type {
  ComfyInputValue,
  ComfyPresetInput,
  ComfyPresetSettings,
  ComfyPresetSummary,
} from "@/shared/types";

/** Which ComfyUI job a form serves: edit presets load a source file, generate presets do not. */
export type ComfyPresetKind = "edit" | "generate";

/** Lists a preset under one job. An unparseable preset (null) lists under both, so queueing it
 * names the fix. */
export function presetBelongsTo(preset: ComfyPresetSummary, kind: ComfyPresetKind): boolean {
  return kind === "generate" ? preset.generates !== false : preset.generates !== true;
}

interface PresetMemory {
  preset: string;
  by_preset: Record<string, ComfyPresetSettings>;
}

export interface ResolvedPresetValues {
  preset: string;
  /** Null leaves the seed to the job: the preset's own when editing, random when generating. */
  seed: number | null;
  /** Empty runs whatever text the preset's prompt node was saved with. */
  promptText: string;
  /** By custom input name; a name left out runs with the preset's saved value. */
  inputs: Record<string, ComfyInputValue>;
}

interface PresetDraft {
  seedText: string;
  promptText: string;
  /** Field text by input name; a boolean holds `"on"`/`"off"`. Empty runs the saved value. */
  inputs: Record<string, string>;
}

const EMPTY_DRAFT: PresetDraft = { seedText: "", promptText: "", inputs: {} };

function inputText(value: ComfyInputValue): string {
  if (typeof value === "boolean") return value ? "on" : "off";
  return String(value);
}

function toDraft(settings: ComfyPresetSettings): PresetDraft {
  return {
    seedText: settings.seed == null ? "" : String(settings.seed),
    promptText: settings.prompt_text,
    inputs: Object.fromEntries(
      Object.entries(settings.inputs).map(([name, value]) => [name, inputText(value)]),
    ),
  };
}

function sameDraft(a: PresetDraft, b: PresetDraft): boolean {
  const names = new Set([...Object.keys(a.inputs), ...Object.keys(b.inputs)]);
  return (
    a.seedText === b.seedText &&
    a.promptText === b.promptText &&
    [...names].every((name) => (a.inputs[name] ?? "") === (b.inputs[name] ?? ""))
  );
}

const KIND_NOUNS: Record<ComfyPresetInput["kind"], string> = {
  boolean: "on or off",
  integer: "a whole number",
  number: "a number",
  text: "text",
};

/** The value to send, null for an empty field, or undefined when the text does not parse. */
function parseInput(input: ComfyPresetInput, text: string): ComfyInputValue | null | undefined {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (input.kind === "text") return text;
  if (input.kind === "boolean") return trimmed === "on";
  if (input.kind === "integer") return /^-?\d+$/.test(trimmed) ? Number(trimmed) : undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export type PresetsState =
  | { status: "loading" }
  | { status: "ready"; presets: ComfyPresetSummary[]; available: boolean; baseUrl: string }
  | { status: "error"; message: string };

const EMPTY_SEED_MEANING: Record<ComfyPresetKind, string> = {
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
 * The preset choice and its prompt, seed and custom inputs, shared by both ComfyUI job dialogs.
 * Each preset keeps its own draft, so switching workflows never loses what was typed for another.
 * With `embedded`, the file's own workflow is the only choice and `preset` is its display name.
 */
export function useComfyPresetForm(
  remembered: PresetMemory,
  kind: ComfyPresetKind,
  embedded?: EmbeddedGenerateWorkflow,
) {
  const initial = useMemo(
    () => (embedded ? embeddedMemory(embedded) : remembered),
    [embedded, remembered],
  );
  const presetsQuery = useQuery(comfyPresetsQueryOptions());
  const state: PresetsState = presetsQuery.data
    ? {
        status: "ready",
        presets: embedded
          ? [embeddedPresetSummary(embedded)]
          : presetsQuery.data.presets.filter((entry) => presetBelongsTo(entry, kind)),
        available: presetsQuery.data.available,
        baseUrl: presetsQuery.data.base_url,
      }
    : presetsQuery.isError
      ? { status: "error", message: formatApiError(presetsQuery.error) }
      : { status: "loading" };
  const [chosenPreset, setChosenPreset] = useState(initial.preset);
  // Honour a stored name only once the list is known, or the select shows a missing option.
  const loadedPresets = state.status === "ready" ? state.presets : undefined;
  const resolvePreset = (name: string) =>
    loadedPresets && !loadedPresets.some((entry) => entry.name === name)
      ? (loadedPresets[0]?.name ?? "")
      : name;
  const preset = resolvePreset(chosenPreset);
  const [drafts, setDrafts] = useState<Record<string, PresetDraft>>(() =>
    Object.fromEntries(
      Object.entries(initial.by_preset).map(([name, saved]) => [name, toDraft(saved)]),
    ),
  );
  const draft = drafts[preset] ?? EMPTY_DRAFT;
  const updateDraft = (patch: Partial<PresetDraft>) =>
    setDrafts((current) => ({
      ...current,
      [preset]: { ...(current[preset] ?? EMPTY_DRAFT), ...patch },
    }));

  const selected = loadedPresets?.find((entry) => entry.name === preset) ?? null;
  // Only false blocks: a preset that could not be parsed reports null and keeps both fields live.
  const promptBlocked = selected?.accepts_prompt === false;
  const seedBlocked = selected?.accepts_seed === false;
  const customInputs = selected?.inputs ?? [];

  const changed =
    preset !== resolvePreset(initial.preset) ||
    Object.entries(drafts).some(([name, entry]) => {
      const saved = initial.by_preset[name];
      return !sameDraft(entry, saved ? toDraft(saved) : EMPTY_DRAFT);
    });

  /** What to send, or the message naming the first field that does not parse. */
  const resolve = (): { values: ResolvedPresetValues } | { error: string } => {
    if (!preset) return { error: "Choose a workflow preset." };

    const seedText = draft.seedText.trim();
    if (seedText && !/^\d+$/.test(seedText)) {
      return { error: `The seed must be a whole number, ${EMPTY_SEED_MEANING[kind]}.` };
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
      },
    };
  };

  return {
    state,
    preset,
    selectPreset: setChosenPreset,
    draft,
    updateDraft,
    promptBlocked,
    seedBlocked,
    customInputs,
    changed,
    resolve,
  };
}

export type ComfyPresetForm = ReturnType<typeof useComfyPresetForm>;
