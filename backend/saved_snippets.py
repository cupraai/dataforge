"""Named texts a dialog can insert, kept per book and shared by every folder."""

from __future__ import annotations

from constants import MAX_SAVED_SNIPPETS
from preferences import JsonPreference
from schemas import SavedSnippet, SavedSnippetsResponse, SnippetBook

_STORES: dict[SnippetBook, JsonPreference[SavedSnippetsResponse]] = {
    "instructions": JsonPreference("instruction_snippets", SavedSnippetsResponse),
    "verify_contexts": JsonPreference("verify_context_snippets", SavedSnippetsResponse),
    "comfy_prompts": JsonPreference("comfy_prompt_snippets", SavedSnippetsResponse),
}

_NOUNS: dict[SnippetBook, str] = {
    "instructions": "instructions",
    "verify_contexts": "contexts",
    "comfy_prompts": "prompts",
}


class TooManySnippetsError(ValueError):
    pass


def preference_key(book: SnippetBook) -> str:
    return _STORES[book].key


def _name_key(snippet: SavedSnippet) -> str:
    return snippet.name.casefold()


def _sorted(snippets: list[SavedSnippet]) -> SavedSnippetsResponse:
    ordered: list[SavedSnippet] = sorted(snippets, key=_name_key)
    return SavedSnippetsResponse(snippets=ordered)


def list_snippets(book: SnippetBook) -> SavedSnippetsResponse:
    return _STORES[book].get()


def save_snippet(book: SnippetBook, snippet: SavedSnippet) -> SavedSnippetsResponse:
    """Replaces a match ignoring case."""
    store = _STORES[book]
    key = snippet.name.casefold()
    others = [kept for kept in store.get().snippets if kept.name.casefold() != key]
    if len(others) >= MAX_SAVED_SNIPPETS:
        raise TooManySnippetsError(
            f"At most {MAX_SAVED_SNIPPETS} {_NOUNS[book]} can be saved. Delete one first."
        )
    return store.save(_sorted([*others, snippet]))


def delete_snippet(book: SnippetBook, name: str) -> SavedSnippetsResponse:
    """Removing an unsaved name changes nothing."""
    store = _STORES[book]
    key = name.strip().casefold()
    kept = [snippet for snippet in store.get().snippets if snippet.name.casefold() != key]
    return store.save(_sorted(kept))
