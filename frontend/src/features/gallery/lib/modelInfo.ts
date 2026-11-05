import { formatCount } from "@/shared/lib/format";
import type { ModelInfoResponse } from "@/shared/types";

const PARAMETER_UNITS = [
  { size: 1e9, suffix: "B" },
  { size: 1e6, suffix: "M" },
  { size: 1e3, suffix: "K" },
] as const;

/** `1.2B`, `340M`: how model sizes are quoted. Exact counts belong in a tooltip. */
export function formatParameterCount(count: number): string {
  for (const unit of PARAMETER_UNITS) {
    if (count >= unit.size) {
      const value = count / unit.size;
      return `${value >= 100 ? Math.round(value) : Number(value.toFixed(1))}${unit.suffix}`;
    }
  }
  return String(count);
}

/** Short badges for the header: what the file is, what it is for, and how it is stored. */
export function modelBadges(info: ModelInfoResponse): string[] {
  const badges = [info.rank != null ? "LoRA" : "Weights"];
  if (info.architecture) badges.push(info.architecture);
  if (info.precision) badges.push(info.precision);
  return badges;
}

export interface ModelFact {
  label: string;
  value: string;
  title?: string;
}

/** The facts worth a glance, in reading order; anything the header does not record is left out. */
export function modelFacts(info: ModelInfoResponse): ModelFact[] {
  const facts: Array<ModelFact | null> = [
    info.step != null ? { label: "Step", value: formatCount(info.step) } : null,
    info.epoch != null ? { label: "Epoch", value: formatCount(info.epoch) } : null,
    info.rank != null ? { label: "Rank", value: String(info.rank) } : null,
    info.alpha != null ? { label: "Alpha", value: String(info.alpha) } : null,
    {
      label: "Parameters",
      value: formatParameterCount(info.parameter_count),
      title: `${formatCount(info.parameter_count)} parameters`,
    },
    { label: "Tensors", value: formatCount(info.tensor_count) },
    info.software ? { label: "Trained with", value: info.software } : null,
  ];
  return facts.filter((fact): fact is ModelFact => fact !== null);
}

export interface MetadataEntry {
  key: string;
  value: string;
  /** Indented JSON for a value that holds an object or array; `null` for plain text. */
  json: string | null;
  /** One line that stands for a collapsed JSON value, such as `{ step, epoch }`. */
  summary: string;
}

const SUMMARY_KEYS = 3;

function summarize(parsed: unknown): string {
  if (Array.isArray(parsed)) {
    return `[ ${parsed.length} ${parsed.length === 1 ? "item" : "items"} ]`;
  }
  const keys = Object.keys(parsed as object);
  const shown = keys.slice(0, SUMMARY_KEYS).join(", ");
  return keys.length > SUMMARY_KEYS
    ? `{ ${shown}, +${keys.length - SUMMARY_KEYS} }`
    : `{ ${shown} }`;
}

function parseJson(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return undefined;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return parsed !== null && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function metadataEntries(metadata: Record<string, string>): MetadataEntry[] {
  return Object.entries(metadata)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => {
      const parsed = parseJson(value);
      return parsed === undefined
        ? { key, value, json: null, summary: value }
        : { key, value, json: JSON.stringify(parsed, null, 2), summary: summarize(parsed) };
    });
}

/** The whole `__metadata__` as one JSON object, its embedded JSON strings unpacked. */
export function metadataAsJson(metadata: Record<string, string>): string {
  const unpacked = Object.fromEntries(
    metadataEntries(metadata).map(({ key, value, json }) => [
      key,
      json === null ? value : parseJson(value),
    ]),
  );
  return JSON.stringify(unpacked, null, 2);
}

/** The filename without `.safetensors`: what the header shows when no title is recorded. */
export function modelStem(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}
