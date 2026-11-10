"""Saved Edit captions instructions, shared by every folder."""

from __future__ import annotations

from constants import MAX_INSTRUCTION_SNIPPETS
from preferences import JsonPreference
from schemas import InstructionSnippet, InstructionSnippetsResponse

INSTRUCTION_SNIPPETS_KEY = "instruction_snippets"

_store: JsonPreference[InstructionSnippetsResponse] = JsonPreference(
    INSTRUCTION_SNIPPETS_KEY, InstructionSnippetsResponse
)


class TooManySnippetsError(ValueError):
    pass


def _name_key(snippet: InstructionSnippet) -> str:
    return snippet.name.casefold()


def _sorted(snippets: list[InstructionSnippet]) -> InstructionSnippetsResponse:
    ordered: list[InstructionSnippet] = sorted(snippets, key=_name_key)
    return InstructionSnippetsResponse(snippets=ordered)


def list_snippets() -> InstructionSnippetsResponse:
    return _store.get()


def save_snippet(snippet: InstructionSnippet) -> InstructionSnippetsResponse:
    """Adds ``snippet``, or replaces the one whose name matches it ignoring case."""
    key = snippet.name.casefold()
    others = [kept for kept in _store.get().snippets if kept.name.casefold() != key]
    if len(others) >= MAX_INSTRUCTION_SNIPPETS:
        raise TooManySnippetsError(
            f"At most {MAX_INSTRUCTION_SNIPPETS} instructions can be saved. Delete one first."
        )
    return _store.save(_sorted([*others, snippet]))


def delete_snippet(name: str) -> InstructionSnippetsResponse:
    """Removing a name that is not saved changes nothing."""
    key = name.strip().casefold()
    kept = [snippet for snippet in _store.get().snippets if snippet.name.casefold() != key]
    return _store.save(_sorted(kept))
