import type { ComfyLora, ComfyShowcaseItem } from "@/shared/types";

/** The backend's ``LABEL_EXCERPT_LENGTH``: a label falls back to the prompt cut to this. */
const LABEL_EXCERPT_LENGTH = 40;

/** Mirrors the backend's ``item_label``, so the list and the results name an item alike. */
export function showcaseItemTitle(
  item: Pick<ComfyShowcaseItem, "label" | "prompt_text">,
  number: number,
): string {
  const label = item.label.trim();
  if (label) return label;
  const line = item.prompt_text
    .split(/\r?\n/)
    .map((part) => part.trim())
    .find(Boolean);
  if (!line) return `Item ${number}`;
  if (line.length <= LABEL_EXCERPT_LENGTH) return line;
  return `${line.slice(0, LABEL_EXCERPT_LENGTH - 1).trimEnd()}…`;
}

const NUMBERED_SAVE = /^(.+)_(\d{9})$/;

/** The backend's ``describe_lora``, for names typed or remembered before the list loads. */
export function describeLora(name: string): ComfyLora {
  const base = name.split(/[\\/]/).pop() ?? name;
  const stem = base.includes(".") ? base.slice(0, base.lastIndexOf(".")) : base;
  const match = NUMBERED_SAVE.exec(stem);
  return match
    ? { name, stem, run: match[1], step: Number(match[2]) }
    : { name, stem, run: stem, step: null };
}

/** "step 1500" when every LoRA compared is a save of one run; the file's stem otherwise. */
export function loraLabel(name: string, compared: readonly string[]): string {
  const lora = describeLora(name);
  const runs = new Set(compared.map((entry) => describeLora(entry).run));
  if (compared.length > 1 && runs.size === 1) {
    return lora.step === null ? "final" : `step ${lora.step}`;
  }
  return lora.stem;
}

/** A run's saves in training order, the final save last. */
export function savesOfRun(loras: readonly ComfyLora[], run: string): string[] {
  return loras
    .filter((lora) => lora.run === run)
    .sort((a, b) => (a.step ?? Infinity) - (b.step ?? Infinity))
    .map((lora) => lora.name);
}

export interface ShowcaseTotals {
  items: number;
  loras: number;
  generations: number;
}

export function showcaseTotals(
  items: ReadonlyArray<Pick<ComfyShowcaseItem, "enabled">>,
  loras: number,
): ShowcaseTotals {
  const enabled = items.filter((item) => item.enabled).length;
  return { items: enabled, loras, generations: enabled * loras };
}

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** How the sheet comes out, which the job lays out by itself. */
export function sheetLayoutText({ items, loras }: ShowcaseTotals): string {
  if (loras <= 1) return `${plural(items, "item")} in a grid`;
  return `${plural(items, "item")} down, ${loras} LoRAs across`;
}

/** "8 items × 3 LoRAs = 24 generations", or just the items when one LoRA is shown. */
export function showcaseTotalsText({ items, loras, generations }: ShowcaseTotals): string {
  if (loras <= 1) return plural(items, "item");
  return `${plural(items, "item")} × ${loras} LoRAs = ${plural(generations, "generation")}`;
}
