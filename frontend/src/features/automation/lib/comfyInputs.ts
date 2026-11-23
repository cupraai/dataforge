import type { ComfyInputValue, ComfyPresetInput } from "@/shared/types";

/** A custom input's value as field text; an empty field runs the saved value. */
export function inputText(value: ComfyInputValue): string {
  if (typeof value === "boolean") return value ? "on" : "off";
  return String(value);
}

export const KIND_NOUNS: Record<ComfyPresetInput["kind"], string> = {
  boolean: "on or off",
  integer: "a whole number",
  number: "a number",
  text: "text",
};

/** The value to send, null for an empty field, or undefined when the text does not parse. */
export function parseInput(
  input: ComfyPresetInput,
  text: string,
): ComfyInputValue | null | undefined {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (input.kind === "text") return text;
  if (input.kind === "boolean") return trimmed === "on";
  if (input.kind === "integer") return /^-?\d+$/.test(trimmed) ? Number(trimmed) : undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}
