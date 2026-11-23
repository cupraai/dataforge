from __future__ import annotations

import unittest
from unittest.mock import patch

import showcase_sets
from db import get_connection
from routes._test_client import client
from schemas import ComfyShowcaseSet
from showcase_sets import (
    SHOWCASE_SETS_KEY,
    TooManyShowcaseSetsError,
    delete_showcase_set,
    list_showcase_sets,
    save_showcase_set,
)


def _set(name: str, prompt: str = "a beach") -> ComfyShowcaseSet:
    return ComfyShowcaseSet.model_validate(
        {"name": name, "preset": "t2i", "items": [{"prompt_text": prompt}]}
    )


def _names() -> list[str]:
    return [saved.name for saved in list_showcase_sets().sets]


def _clear() -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM preferences WHERE key = ?", (SHOWCASE_SETS_KEY,))
        conn.commit()


class ShowcaseSetStoreTests(unittest.TestCase):
    def tearDown(self) -> None:
        _clear()

    def test_sets_are_sorted_ignoring_case_and_keep_their_items(self) -> None:
        save_showcase_set(_set("portraits"))
        save_showcase_set(_set("Beaches", "sand"))

        self.assertEqual(_names(), ["Beaches", "portraits"])
        self.assertEqual(list_showcase_sets().sets[0].items[0].prompt_text, "sand")

    def test_same_name_ignoring_case_replaces(self) -> None:
        save_showcase_set(_set("Portraits", "one"))
        save_showcase_set(_set("portraits", "two"))

        [saved] = list_showcase_sets().sets
        self.assertEqual((saved.name, saved.items[0].prompt_text), ("portraits", "two"))

    def test_the_limit_refuses_a_new_name_but_allows_replacing(self) -> None:
        with patch.object(showcase_sets, "MAX_SHOWCASE_SETS", 1):
            save_showcase_set(_set("one"))
            save_showcase_set(_set("ONE"))
            with self.assertRaises(TooManyShowcaseSetsError):
                save_showcase_set(_set("two"))

        self.assertEqual(_names(), ["ONE"])

    def test_delete_matches_ignoring_case_and_tolerates_missing(self) -> None:
        save_showcase_set(_set("Portraits"))

        delete_showcase_set(" portraits ")
        delete_showcase_set("missing")

        self.assertEqual(_names(), [])


class ShowcaseSetEndpointTests(unittest.TestCase):
    def tearDown(self) -> None:
        _clear()

    def _put(self, name: str):
        body = {**_set("any").model_dump(), "name": name}
        return client.put("/api/automation/comfy-showcase/sets", json=body)

    def test_saving_lists_and_deleting_round_trip(self) -> None:
        self.assertEqual(self._put("Portraits").status_code, 200)
        listed = client.get("/api/automation/comfy-showcase/sets").json()
        self.assertEqual([saved["name"] for saved in listed["sets"]], ["Portraits"])

        deleted = client.delete("/api/automation/comfy-showcase/sets?name=portraits")
        self.assertEqual(deleted.json(), {"sets": []})

    def test_too_many_sets_is_a_422(self) -> None:
        with patch.object(showcase_sets, "MAX_SHOWCASE_SETS", 0):
            response = self._put("Portraits")

        self.assertEqual(response.status_code, 422)
        self.assertIn("Delete one first", response.text)

    def test_a_blank_name_is_refused(self) -> None:
        self.assertEqual(self._put("  ").status_code, 422)


if __name__ == "__main__":
    unittest.main()
