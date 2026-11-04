from __future__ import annotations

import unittest

from testing_fixtures import isolate_test_database

isolate_test_database()

from constants import SYSPROMPT_FILENAME
from sysprompt import load_sysprompt, save_sysprompt, validate_sysprompt
from testing_fixtures import TempMediaFolder, write_sysprompt


class SyspromptValidationTests(unittest.TestCase):
    def test_accepts_standard_markdown_after_a_level_one_heading(self) -> None:
        for text in (
            "# Instructions",
            "# Instructions\n\nDescribe the **subject**.\n- Include the setting.\n\n# Format\nOne paragraph.",
            "\n # Instructions\n\nUnfinished *formatting is ordinary Markdown text.",
            "# Instructions\n\n```markdown\n## A code example\n```",
            "# Instructions\n\n    ## Indented code\n\nEscaped \\## text.",
            "# Instructions\n\n## Details\n\n### Format\nOne paragraph.",
            "# Instructions\n\n> ### Quoted heading",
            "# Instructions\n\nTitle\n=====",
            "# Instructions\n\nTitle\n-----",
        ):
            with self.subTest(text=text):
                validate_sysprompt(text)

    def test_rejects_empty_prompts_and_missing_or_invalid_headings(self) -> None:
        for text in (
            "",
            "  \n",
            "Describe the scene.",
            "## Instructions",
            "### Instructions",
            "#Title",
            "#\nBody",
            "## ",
            "# ###",
            "[example]: https://example.com\n\n# Instructions",
        ):
            with self.subTest(text=text), self.assertRaises(ValueError):
                validate_sysprompt(text)

    def test_invalid_save_preserves_the_existing_file(self) -> None:
        with TempMediaFolder() as root:
            path = write_sysprompt(root, "# Instructions\n\nDescribe the scene.\n")
            with self.assertRaisesRegex(ValueError, "heading"):
                save_sysprompt(root, "Plain text without a heading.")
            self.assertEqual(
                path.read_text(encoding="utf-8"), "# Instructions\n\nDescribe the scene.\n"
            )

    def test_invalid_local_prompt_blocks_a_valid_parent(self) -> None:
        with TempMediaFolder() as root:
            write_sysprompt(root, "# Instructions\n\nDescribe the scene.")
            child = root / "portraits"
            child.mkdir()
            (child / SYSPROMPT_FILENAME).write_text("Plain text.", encoding="utf-8")
            self.assertIsNone(load_sysprompt(child))
            save_sysprompt(child, " ")
            self.assertEqual(load_sysprompt(child), "# Instructions\n\nDescribe the scene.")
