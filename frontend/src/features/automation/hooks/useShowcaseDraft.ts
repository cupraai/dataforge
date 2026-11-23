import { useState } from "react";
import { inputText, KIND_NOUNS, parseInput } from "@/features/automation/lib/comfyInputs";
import { showcaseItemTitle } from "@/features/automation/lib/showcase";
import { LORA_STRENGTH_LIMIT, MAX_SHOWCASE_ITEMS } from "@/shared/constants";
import type {
  ComfyInputValue,
  ComfyPresetSummary,
  ComfyShowcaseItem,
  ComfyShowcaseJobSettings,
} from "@/shared/types";

/** What a saved set holds: everything but the LoRA showcased and the output. */
export type ShowcaseContent = Pick<ComfyShowcaseJobSettings, "preset" | "inputs" | "items">;

export interface LoraRowDraft {
  key: string;
  name: string;
  strengthText: string;
  enabled: boolean;
}

/** Numbers held as text, so a field can be emptied mid-edit instead of snapping back. */
export interface ItemDraft {
  key: string;
  label: string;
  enabled: boolean;
  promptText: string;
  strengthText: string;
  loras: LoraRowDraft[];
  seedText: string;
  /** Field text by input name; empty runs the showcase's value. */
  inputs: Record<string, string>;
  sourcePath: string | null;
}

export interface ShowcaseDraft {
  preset: string;
  /** Every item's inputs; empty runs the preset's saved value. */
  inputs: Record<string, string>;
  items: ItemDraft[];
  subjects: string[];
  namePrefix: string;
  captionFromPrompt: boolean;
  makeSheet: boolean;
}

/** The inputs every item shares, or an item by position. */
export type ShowcaseSelection = "shared" | number;

let nextKey = 0;
function newKey(): string {
  nextKey += 1;
  return `showcase-${nextKey}`;
}

function inputTexts(values: Record<string, ComfyInputValue>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, inputText(value)]),
  );
}

export function blankLoraRow(): LoraRowDraft {
  return { key: newKey(), name: "", strengthText: "1", enabled: true };
}

function blankItem(): ItemDraft {
  return {
    key: newKey(),
    label: "",
    enabled: true,
    promptText: "",
    strengthText: "1",
    loras: [],
    seedText: "",
    inputs: {},
    sourcePath: null,
  };
}

function itemDraft(item: ComfyShowcaseItem): ItemDraft {
  return {
    key: newKey(),
    label: item.label,
    enabled: item.enabled,
    promptText: item.prompt_text,
    strengthText: String(item.subject_strength),
    loras: item.loras.map((lora) => ({
      key: newKey(),
      name: lora.name,
      strengthText: String(lora.strength),
      enabled: lora.enabled,
    })),
    seedText: item.seed == null ? "" : String(item.seed),
    inputs: inputTexts(item.inputs),
    sourcePath: item.source_path ?? null,
  };
}

/** A set or remembered run, with a first blank item so the editor never opens empty. */
function contentDraft(
  content: ShowcaseContent,
): Pick<ShowcaseDraft, "preset" | "inputs" | "items"> {
  return {
    preset: content.preset,
    inputs: inputTexts(content.inputs),
    items: content.items.length > 0 ? content.items.map(itemDraft) : [blankItem()],
  };
}

function draftFromSettings(settings: ComfyShowcaseJobSettings): ShowcaseDraft {
  return {
    ...contentDraft(settings),
    subjects: settings.subject_loras,
    namePrefix: settings.name_prefix,
    captionFromPrompt: settings.caption_from_prompt,
    makeSheet: settings.make_sheet,
  };
}

/** Ignores the keys, which only tell rows apart. */
function comparable(draft: ShowcaseDraft): string {
  return JSON.stringify({
    ...draft,
    items: draft.items.map(({ key: _key, loras, ...item }) => ({
      ...item,
      loras: loras.map(({ key: _loraKey, ...lora }) => lora),
    })),
  });
}

/** The first problem, and what to select to fix it. */
export interface ShowcaseProblem {
  error: string;
  select?: ShowcaseSelection;
}

function parseStrength(text: string): number | undefined {
  const value = Number(text.trim());
  return text.trim() && Number.isFinite(value) && Math.abs(value) <= LORA_STRENGTH_LIMIT
    ? value
    : undefined;
}

const STRENGTH_RULE = `a number from -${LORA_STRENGTH_LIMIT} to ${LORA_STRENGTH_LIMIT}`;

function resolveInputs(
  texts: Record<string, string>,
  preset: ComfyPresetSummary | null,
): { inputs: Record<string, ComfyInputValue> } | { error: string } {
  const inputs: Record<string, ComfyInputValue> = {};
  for (const input of preset?.inputs ?? []) {
    const value = parseInput(input, texts[input.name] ?? "");
    if (value === undefined) {
      return { error: `${input.name} must be ${KIND_NOUNS[input.kind]}, or empty.` };
    }
    if (value !== null) inputs[input.name] = value;
  }
  return { inputs };
}

function resolveItem(
  item: ItemDraft,
  preset: ComfyPresetSummary | null,
): { item: ComfyShowcaseItem } | { error: string } {
  const strength = parseStrength(item.strengthText);
  if (strength === undefined) return { error: `the LoRA strength must be ${STRENGTH_RULE}.` };
  const seedText = item.seedText.trim();
  if (seedText && !/^\d+$/.test(seedText)) {
    return { error: "the seed must be a whole number, or empty for a random seed." };
  }
  const loras = [];
  for (const lora of item.loras) {
    const loraStrength = parseStrength(lora.strengthText);
    if (!lora.name) return { error: "choose a LoRA for every row, or remove the empty one." };
    if (loraStrength === undefined) return { error: `every strength must be ${STRENGTH_RULE}.` };
    loras.push({ name: lora.name, strength: loraStrength, enabled: lora.enabled });
  }
  const overrides = resolveInputs(item.inputs, preset);
  if ("error" in overrides) return overrides;

  return {
    item: {
      label: item.label.trim(),
      enabled: item.enabled,
      prompt_text: preset?.accepts_prompt === false ? "" : item.promptText.trim(),
      subject_strength: strength,
      loras,
      seed: seedText ? Number(seedText) : null,
      inputs: overrides.inputs,
      source_path: preset?.source_kind ? item.sourcePath : null,
    },
  };
}

/** What a set stores: everything the draft holds that no LoRA is needed for. */
export function resolveContent(
  draft: ShowcaseDraft,
  preset: ComfyPresetSummary | null,
): { content: ShowcaseContent } | ShowcaseProblem {
  if (!preset) return { error: "Choose a workflow preset." };
  const shared = resolveInputs(draft.inputs, preset);
  if ("error" in shared) return { error: shared.error, select: "shared" };

  const items: ComfyShowcaseItem[] = [];
  for (const [index, entry] of draft.items.entries()) {
    const resolved = resolveItem(entry, preset);
    if ("error" in resolved) {
      return { error: `Item ${index + 1}: ${resolved.error}`, select: index };
    }
    items.push(resolved.item);
  }
  return { content: { preset: preset.name, inputs: shared.inputs, items } };
}

/** The start body, or what does not parse; the rest is the backend's to refuse. */
export function resolveShowcase(
  draft: ShowcaseDraft,
  preset: ComfyPresetSummary | null,
): { body: ComfyShowcaseJobSettings } | ShowcaseProblem {
  const resolved = resolveContent(draft, preset);
  if ("error" in resolved) return resolved;
  if (draft.subjects.length === 0) return { error: "Choose the LoRA to showcase." };
  return {
    body: {
      ...resolved.content,
      subject_loras: draft.subjects,
      name_prefix: draft.namePrefix.trim(),
      caption_from_prompt: draft.captionFromPrompt,
      make_sheet: draft.makeSheet,
    },
  };
}

/** The draft and its edits; the selection follows items as they move. */
export function useShowcaseDraft(initial: ComfyShowcaseJobSettings) {
  const [draft, setDraft] = useState(() => draftFromSettings(initial));
  const [selection, setSelection] = useState<ShowcaseSelection>(0);
  const [baseline] = useState(() => comparable(draft));

  const update = (patch: Partial<ShowcaseDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const updateItem = (index: number, patch: Partial<ItemDraft>) =>
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, at) => (at === index ? { ...item, ...patch } : item)),
    }));

  const insertItem = (item: ItemDraft, at: number) => {
    if (draft.items.length >= MAX_SHOWCASE_ITEMS) return;
    setDraft((current) => ({
      ...current,
      items: [...current.items.slice(0, at), item, ...current.items.slice(at)],
    }));
    setSelection(at);
  };

  const addItem = () => insertItem(blankItem(), draft.items.length);

  const duplicateItem = (index: number) => {
    const source = draft.items[index];
    if (!source) return;
    insertItem(
      {
        ...source,
        key: newKey(),
        loras: source.loras.map((lora) => ({ ...lora, key: newKey() })),
      },
      index + 1,
    );
  };

  const removeItem = (index: number) => {
    setDraft((current) => {
      const items = current.items.filter((_, at) => at !== index);
      return { ...current, items: items.length > 0 ? items : [blankItem()] };
    });
    setSelection((current) =>
      current === "shared"
        ? current
        : Math.max(0, current > index ? current - 1 : Math.min(current, draft.items.length - 2)),
    );
  };

  const moveItem = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= draft.items.length) return;
    setDraft((current) => {
      const items = [...current.items];
      const [moved] = items.splice(index, 1);
      items.splice(target, 0, moved);
      return { ...current, items };
    });
    setSelection((current) => (current === index ? target : current));
  };

  /** A saved set replaces the items and inputs; the LoRAs and output stay. */
  const loadSet = (content: ShowcaseContent) => {
    setDraft((current) => ({ ...current, ...contentDraft(content) }));
    setSelection(0);
  };

  return {
    draft,
    selection,
    select: setSelection,
    update,
    updateItem,
    addItem,
    duplicateItem,
    removeItem,
    moveItem,
    loadSet,
    changed: comparable(draft) !== baseline,
    titleOf: (index: number) => {
      const item = draft.items[index];
      return item
        ? showcaseItemTitle({ label: item.label, prompt_text: item.promptText }, index + 1)
        : "";
    },
  };
}

export type ShowcaseDraftState = ReturnType<typeof useShowcaseDraft>;
