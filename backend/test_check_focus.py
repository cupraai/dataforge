"""The focus check has to catch rings drawn outside the shared focus-ring system."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path
from types import ModuleType

ROOT = Path(__file__).resolve().parent.parent
CHECK_FOCUS_PATH = ROOT / "scripts" / "check_focus.py"


def _load_check_focus() -> ModuleType:
    spec = importlib.util.spec_from_file_location("dataforge_check_focus", CHECK_FOCUS_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {CHECK_FOCUS_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FocusCheckTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.check = _load_check_focus()

    def _problems(self, source: str) -> list[str]:
        return self.check.problems_in("sample.scss", source)

    def test_own_rings_under_focus_selectors_fail(self) -> None:
        for source in (
            "a:focus-visible { outline: 2px solid var(--accent); }",
            "a { &:focus { outline: none; } }",
            "a { &:focus-within { box-shadow: 0 0 0 3px var(--accent-soft); } }",
            "a { &:has(:focus-visible) { outline-offset: 1px; } }",
            "a:focus-visible { .b { outline-color: red; } }",
            ".cm-editor.cm-focused { outline: none; }",
        ):
            with self.subTest(source=source):
                self.assertEqual(len(self._problems(source)), 1)

    def test_mixins_colours_and_other_states_pass(self) -> None:
        for source in (
            'a { @include focus-ring-within("&:has(:focus-visible)"); }',
            "a { @include focus-ring-detached; }",
            "a { &:focus-visible { --focus-ring-color: var(--bg); background: red; } }",
            "a { &:focus-within { border-color: var(--accent-border); } }",
            "a { &:hover { box-shadow: var(--elevation-2); } }",
            "a { outline: 1px dashed var(--media-outline); margin: -#{$gap}; }",
            "a { // &:focus { outline: none; }\n}",
            "a { /* &:focus { outline: none; } */ }",
        ):
            with self.subTest(source=source):
                self.assertEqual(self._problems(source), [])

    def test_reports_the_declaration_line(self) -> None:
        problems = self._problems("a {\n  &:focus-visible {\n    outline: none;\n  }\n}")
        self.assertEqual(len(problems), 1)
        self.assertTrue(problems[0].startswith("sample.scss:3:"), problems[0])

    def test_the_stylesheets_pass(self) -> None:
        self.assertEqual(self.check.collect_problems(), [])


if __name__ == "__main__":
    unittest.main()
