import { queryOptions } from "@tanstack/react-query";
import { putJson, requestJson } from "@/shared/api/http";
import type { SavedSnippet, SavedSnippetsResponse, SnippetBook } from "@/shared/types";

export function savedSnippetsQueryKey(book: SnippetBook) {
  return ["saved-snippets", book] as const;
}

function bookUrl(book: SnippetBook): string {
  return `/api/preferences/snippets/${book}`;
}

export function savedSnippetsQueryOptions(book: SnippetBook) {
  return queryOptions({
    queryKey: savedSnippetsQueryKey(book),
    queryFn: ({ signal }) => requestJson<SavedSnippetsResponse>(bookUrl(book), { signal }),
  });
}

/** Replaces a saved snippet whose name matches ignoring case. */
export function saveSnippet(
  book: SnippetBook,
  snippet: SavedSnippet,
): Promise<SavedSnippetsResponse> {
  return putJson<SavedSnippetsResponse>(bookUrl(book), snippet);
}

export function deleteSnippet(book: SnippetBook, name: string): Promise<SavedSnippetsResponse> {
  const params = new URLSearchParams({ name });
  return requestJson<SavedSnippetsResponse>(`${bookUrl(book)}?${params}`, { method: "DELETE" });
}
