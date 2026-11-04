import { putJson, requestJson } from "@/shared/api/http";
import type {
  FolderInstructionsResponse,
  InstructionFileResponse,
  InstructionFileUpdate,
} from "@/shared/types";

export type InstructionKind = "sysprompt" | "caption_rules";

const SAVE_ROUTES: Record<InstructionKind, string> = {
  sysprompt: "/api/sysprompt",
  caption_rules: "/api/caption-rules",
};

export async function fetchFolderInstructions(
  folderPath: string,
  signal?: AbortSignal,
): Promise<FolderInstructionsResponse> {
  const params = new URLSearchParams({ path: folderPath });
  return requestJson<FolderInstructionsResponse>(`/api/folder-instructions?${params}`, { signal });
}

export async function saveInstructionFile(
  kind: InstructionKind,
  folderPath: string,
  text: string,
): Promise<InstructionFileResponse> {
  const params = new URLSearchParams({ path: folderPath });
  const body: InstructionFileUpdate = { text };
  return putJson<InstructionFileResponse>(`${SAVE_ROUTES[kind]}?${params}`, body);
}

/** Only the backend's resolved, valid file can be used by a job. */
export function instructionApplies(file: InstructionFileResponse): boolean {
  return file.state.status === "ready";
}
