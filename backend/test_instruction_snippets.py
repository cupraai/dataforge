from __future__ import annotations

import unittest
from unittest.mock import patch

import instruction_snippets
from db import get_connection
from instruction_snippets import (
    INSTRUCTION_SNIPPETS_KEY,
    TooManySnippetsError,
    delete_snippet,
    list_snippets,
    save_snippet,
)
from routes._test_client import client
from schemas import InstructionSnippet


def _names() -> list[str]:
    return [snippet.name for snippet in list_snippets().snippets]


class InstructionSnippetTests(unittest.TestCase):
    def tearDown(self) -> None:
        with get_connection() as conn:
            conn.execute("DELETE FROM preferences WHERE key = ?", (INSTRUCTION_SNIPPETS_KEY,))
            conn.commit()

    def test_empty_by_default(self) -> None:
        self.assertEqual(_names(), [])

    def test_saved_snippets_are_sorted_ignoring_case(self) -> None:
        save_snippet(InstructionSnippet(name="tense", text="Use present tense."))
        save_snippet(InstructionSnippet(name="Colors", text="Name clothing colors."))

        self.assertEqual(_names(), ["Colors", "tense"])

    def test_same_name_ignoring_case_replaces(self) -> None:
        save_snippet(InstructionSnippet(name="Tense", text="old"))
        save_snippet(InstructionSnippet(name="tense", text="new"))

        snippets = list_snippets().snippets
        self.assertEqual([(s.name, s.text) for s in snippets], [("tense", "new")])

    def test_delete_matches_ignoring_case_and_tolerates_missing(self) -> None:
        save_snippet(InstructionSnippet(name="Tense", text="x"))

        delete_snippet(" tense ")
        delete_snippet("missing")

        self.assertEqual(_names(), [])

    def test_limit_refuses_a_new_name_but_allows_replacing(self) -> None:
        with patch.object(instruction_snippets, "MAX_INSTRUCTION_SNIPPETS", 1):
            save_snippet(InstructionSnippet(name="one", text="x"))
            save_snippet(InstructionSnippet(name="ONE", text="y"))
            with self.assertRaises(TooManySnippetsError):
                save_snippet(InstructionSnippet(name="two", text="z"))

        self.assertEqual(_names(), ["ONE"])


class InstructionSnippetRouteTests(unittest.TestCase):
    def tearDown(self) -> None:
        with get_connection() as conn:
            conn.execute("DELETE FROM preferences WHERE key = ?", (INSTRUCTION_SNIPPETS_KEY,))
            conn.commit()

    def test_save_list_delete(self) -> None:
        saved = client.put(
            "/api/preferences/instruction-snippets",
            json={"name": "  Tense ", "text": " Use present tense. "},
        )
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(
            saved.json()["snippets"], [{"name": "Tense", "text": "Use present tense."}]
        )

        listed = client.get("/api/preferences/instruction-snippets")
        self.assertEqual(listed.json(), saved.json())

        deleted = client.delete("/api/preferences/instruction-snippets", params={"name": "tense"})
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(deleted.json()["snippets"], [])

    def test_blank_name_or_text_is_rejected(self) -> None:
        for body in ({"name": " ", "text": "x"}, {"name": "x", "text": "  "}):
            response = client.put("/api/preferences/instruction-snippets", json=body)
            self.assertEqual(response.status_code, 422)

    def test_limit_is_a_422_with_its_message(self) -> None:
        with patch.object(instruction_snippets, "MAX_INSTRUCTION_SNIPPETS", 0):
            response = client.put(
                "/api/preferences/instruction-snippets", json={"name": "a", "text": "b"}
            )
        self.assertEqual(response.status_code, 422)
        self.assertIn("Delete one first", response.json()["detail"])


if __name__ == "__main__":
    unittest.main()
