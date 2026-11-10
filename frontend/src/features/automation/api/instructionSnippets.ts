import { queryOptions } from "@tanstack/react-query";
import { putJson, requestJson } from "@/shared/api/http";
import type { InstructionSnippet, InstructionSnippetsResponse } from "@/shared/types";

export const INSTRUCTION_SNIPPETS_QUERY_KEY = ["instruction-snippets"] as const;

const URL = "/api/preferences/instruction-snippets";

export function instructionSnippetsQueryOptions() {
  return queryOptions({
    queryKey: INSTRUCTION_SNIPPETS_QUERY_KEY,
    queryFn: ({ signal }) => requestJson<InstructionSnippetsResponse>(URL, { signal }),
  });
}

/** Replaces a saved instruction whose name matches ignoring case. */
export function saveInstructionSnippet(
  snippet: InstructionSnippet,
): Promise<InstructionSnippetsResponse> {
  return putJson<InstructionSnippetsResponse>(URL, snippet);
}

export function deleteInstructionSnippet(name: string): Promise<InstructionSnippetsResponse> {
  const params = new URLSearchParams({ name });
  return requestJson<InstructionSnippetsResponse>(`${URL}?${params}`, { method: "DELETE" });
}
