from __future__ import annotations

import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from automation.comfy_run import comfy_run_generates, run_comfy_run_job, validate_comfy_run_folder
from external.comfy_workflows import ComfyWorkflowError

FOLDER = Path("dataset")
EDIT = SimpleNamespace(generates=False)
GENERATION = SimpleNamespace(generates=True)


def _loads(workflow: object):
    return patch("automation.comfy_run.load_comfy_workflow", return_value=workflow)


class GeneratesTests(unittest.TestCase):
    def test_the_preset_decides(self) -> None:
        with _loads(GENERATION):
            self.assertTrue(comfy_run_generates("txt2img", None))
        with _loads(EDIT):
            self.assertFalse(comfy_run_generates("upscale", None))

    def test_a_files_own_workflow_always_generates(self) -> None:
        with patch("automation.comfy_run.load_comfy_workflow") as load:
            self.assertTrue(comfy_run_generates("", {"path": "render.png", "node_id": "9"}))
        load.assert_not_called()

    def test_the_mode_overrides_the_preset(self) -> None:
        with _loads(EDIT):
            self.assertTrue(comfy_run_generates("i2v", None, "generate"))
        with _loads(GENERATION):
            self.assertFalse(comfy_run_generates("txt2img", None, "edit"))

    def test_an_unreadable_preset_counts_as_editing(self) -> None:
        # The edit half then names the parse failure when the job is queued.
        with patch(
            "automation.comfy_run.load_comfy_workflow", side_effect=ComfyWorkflowError("bad")
        ):
            self.assertFalse(comfy_run_generates("broken", None))


class DispatchTests(unittest.TestCase):
    def test_an_editing_preset_runs_on_the_selection(self) -> None:
        selected = [FOLDER / "a.png"]
        with (
            _loads(EDIT),
            patch("automation.comfy_run.run_comfy_process_job", return_value={}) as edit,
            patch("automation.comfy_run.run_comfy_generate_job") as generate,
        ):
            run_comfy_run_job(
                FOLDER, preset="upscale", overwrite_candidates=True, selected_paths=selected
            )

        generate.assert_not_called()
        self.assertEqual(edit.call_args.kwargs["selected_paths"], selected)
        self.assertIs(edit.call_args.kwargs["overwrite_candidates"], True)

    def test_a_generating_preset_ignores_the_selection(self) -> None:
        with (
            _loads(GENERATION),
            patch("automation.comfy_run.run_comfy_process_job") as edit,
            patch("automation.comfy_run.run_comfy_generate_job", return_value={}) as generate,
        ):
            run_comfy_run_job(FOLDER, preset="txt2img", count=3, selected_paths=[FOLDER / "a.png"])

        edit.assert_not_called()
        self.assertEqual(generate.call_args.kwargs["count"], 3)
        self.assertNotIn("selected_paths", generate.call_args.kwargs)

    def test_a_source_preset_generates_from_its_start_file_when_asked(self) -> None:
        with (
            _loads(EDIT),
            patch("automation.comfy_run.run_comfy_process_job") as edit,
            patch("automation.comfy_run.run_comfy_generate_job", return_value={}) as generate,
        ):
            run_comfy_run_job(FOLDER, preset="i2v", mode="generate", start_path="start.png")

        edit.assert_not_called()
        self.assertEqual(generate.call_args.kwargs["start_path"], "start.png")

    def test_a_files_own_workflow_cannot_edit(self) -> None:
        with self.assertRaises(ValueError) as refused:
            validate_comfy_run_folder(
                FOLDER, source={"path": "render.png", "node_id": "9"}, mode="edit"
            )

        self.assertIn("only make new files", str(refused.exception))

    def test_a_workflow_step_refuses_a_generating_preset(self) -> None:
        with (
            _loads(GENERATION),
            patch("automation.comfy_run.validate_comfy_generate_folder") as validate,
            patch("automation.comfy_run.run_comfy_generate_job") as generate,
        ):
            with self.assertRaises(ValueError) as refused:
                validate_comfy_run_folder(FOLDER, preset="txt2img", edits_only=True)
            # The preset may have become a generation one after the step was saved.
            with self.assertRaises(ValueError):
                run_comfy_run_job(FOLDER, preset="txt2img", edits_only=True)

        self.assertIn("cannot be a workflow step", str(refused.exception))
        validate.assert_not_called()
        generate.assert_not_called()

    def test_a_workflow_step_runs_an_editing_preset(self) -> None:
        with (
            _loads(EDIT),
            patch("automation.comfy_run.validate_comfy_process_folder") as validate,
        ):
            validate_comfy_run_folder(FOLDER, preset="upscale", edits_only=True)

        validate.assert_called_once()


if __name__ == "__main__":
    unittest.main()
