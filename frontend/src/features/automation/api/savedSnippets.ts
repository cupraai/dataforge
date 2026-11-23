import type { SavedStore } from "@/features/automation/components/SavedMenu";
import { putJson, requestJson } from "@/shared/api/http";
import type { SavedSnippet, SavedSnippetsResponse, SnippetBook } from "@/shared/types";

export function savedSnippetsStore(
  book: SnippetBook,
): SavedStore<SavedSnippetsResponse, SavedSnippet> {
  const url = `/api/preferences/snippets/${book}`;
  return {
    queryKey: ["saved-snippets", book],
    load: (signal) => requestJson<SavedSnippetsResponse>(url, { signal }),
    entries: (response) => response.snippets,
    save: (snippet) => putJson<SavedSnippetsResponse>(url, snippet),
    remove: (name) =>
      requestJson<SavedSnippetsResponse>(`${url}?${new URLSearchParams({ name })}`, {
        method: "DELETE",
      }),
  };
}
