import type { InstructionFileState } from "@/shared/types";

export const INSTRUCTION_ORIGIN_LABELS: Record<InstructionFileState["origin"], string> = {
  local: "Local",
  inherited: "Inherited",
  missing: "Missing",
};

export const INSTRUCTION_STATUS_LABELS: Record<InstructionFileState["status"], string> = {
  ready: "Ready",
  missing: "Missing",
  empty: "Empty",
  invalid: "Invalid",
  unreadable: "Unreadable",
};

export function instructionFileSummary(state: InstructionFileState): string {
  const origin = INSTRUCTION_ORIGIN_LABELS[state.origin];
  if (state.origin === "missing") return origin;
  const status = state.status === "ready" ? "" : `, ${INSTRUCTION_STATUS_LABELS[state.status]}`;
  return `${origin}${status}: ${state.relative_path}`;
}
