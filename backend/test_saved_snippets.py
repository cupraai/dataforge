from __future__ import annotations

import unittest
from typing import get_args
from unittest.mock import patch

import saved_snippets
from db import get_connection
from routes._test_client import client
from saved_snippets import (
    TooManySnippetsError,
    delete_snippet,
    list_snippets,
    preference_key,
    save_snippet,
)
from schemas import SavedSnippet, SnippetBook

BOOKS: tuple[SnippetBook, ...] = get_args(SnippetBook.__value__)
URL = "/api/preferences/snippets/instructions"


def _names(book: SnippetBook = "instructions") -> list[str]:
    return [snippet.name for snippet in list_snippets(book).snippets]


def _clear_books() -> None:
    with get_connection() as conn:
        for book in BOOKS:
            conn.execute("DELETE FROM preferences WHERE key = ?", (preference_key(book),))
        conn.commit()


class SavedSnippetTests(unittest.TestCase):
    def tearDown(self) -> None:
        _clear_books()

    def test_empty_by_default(self) -> None:
        for book in BOOKS:
            self.assertEqual(_names(book), [])

    def test_saved_snippets_are_sorted_ignoring_case(self) -> None:
        save_snippet("instructions", SavedSnippet(name="tense", text="Use present tense."))
        save_snippet("instructions", SavedSnippet(name="Colors", text="Name clothing colors."))

        self.assertEqual(_names(), ["Colors", "tense"])

    def test_same_name_ignoring_case_replaces(self) -> None:
        save_snippet("instructions", SavedSnippet(name="Tense", text="old"))
        save_snippet("instructions", SavedSnippet(name="tense", text="new"))

        snippets = list_snippets("instructions").snippets
        self.assertEqual([(s.name, s.text) for s in snippets], [("tense", "new")])

    def test_delete_matches_ignoring_case_and_tolerates_missing(self) -> None:
        save_snippet("instructions", SavedSnippet(name="Tense", text="x"))

        delete_snippet("instructions", " tense ")
        delete_snippet("instructions", "missing")

        self.assertEqual(_names(), [])

    def test_books_are_kept_apart(self) -> None:
        save_snippet("instructions", SavedSnippet(name="Shared", text="instruction"))
        save_snippet("verify_contexts", SavedSnippet(name="Shared", text="studio shots"))
        save_snippet("comfy_prompts", SavedSnippet(name="Shared", text="a lighthouse"))
        delete_snippet("instructions", "Shared")

        self.assertEqual(_names("instructions"), [])
        for book, text in (("verify_contexts", "studio shots"), ("comfy_prompts", "a lighthouse")):
            kept = list_snippets(book).snippets
            self.assertEqual([(s.name, s.text) for s in kept], [("Shared", text)])

    def test_limit_refuses_a_new_name_but_allows_replacing(self) -> None:
        with patch.object(saved_snippets, "MAX_SAVED_SNIPPETS", 1):
            save_snippet("instructions", SavedSnippet(name="one", text="x"))
            save_snippet("instructions", SavedSnippet(name="ONE", text="y"))
            with self.assertRaises(TooManySnippetsError):
                save_snippet("instructions", SavedSnippet(name="two", text="z"))

        self.assertEqual(_names(), ["ONE"])


class SavedSnippetRouteTests(unittest.TestCase):
    def tearDown(self) -> None:
        _clear_books()

    def test_save_list_delete(self) -> None:
        saved = client.put(URL, json={"name": "  Tense ", "text": " Use present tense. "})
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(
            saved.json()["snippets"], [{"name": "Tense", "text": "Use present tense."}]
        )

        listed = client.get(URL)
        self.assertEqual(listed.json(), saved.json())

        deleted = client.delete(URL, params={"name": "tense"})
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(deleted.json()["snippets"], [])

    def test_each_book_has_its_own_route(self) -> None:
        client.put(
            "/api/preferences/snippets/comfy_prompts", json={"name": "Dusk", "text": "at dusk"}
        )

        self.assertEqual(client.get(URL).json()["snippets"], [])
        prompts = client.get("/api/preferences/snippets/comfy_prompts").json()["snippets"]
        self.assertEqual(prompts, [{"name": "Dusk", "text": "at dusk"}])

    def test_unknown_book_is_rejected(self) -> None:
        response = client.get("/api/preferences/snippets/other")
        self.assertEqual(response.status_code, 422)

    def test_blank_name_or_text_is_rejected(self) -> None:
        for body in ({"name": " ", "text": "x"}, {"name": "x", "text": "  "}):
            response = client.put(URL, json=body)
            self.assertEqual(response.status_code, 422)

    def test_limit_is_a_422_naming_what_the_book_holds(self) -> None:
        with patch.object(saved_snippets, "MAX_SAVED_SNIPPETS", 0):
            response = client.put(
                "/api/preferences/snippets/comfy_prompts", json={"name": "a", "text": "b"}
            )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(
            response.json()["detail"], "At most 0 prompts can be saved. Delete one first."
        )


if __name__ == "__main__":
    unittest.main()
