from __future__ import annotations

import unittest
from dataclasses import replace
from unittest.mock import patch
from urllib.parse import quote

import job_workflows
from automation.jobs import JOB_SPECS, job_manager
from automation_settings import get_automation_settings
from db import get_connection
from job_workflows import (
    WORKFLOWS_KEY,
    TooManyWorkflowsError,
    WorkflowNameTakenError,
    delete_workflow,
    list_workflows,
    save_workflow,
)
from routes._test_client import client
from schemas import Workflow
from testing_fixtures import TempMediaFolder, reset_job_manager, wait_for_job, write_media


def _workflow(name: str, *job_types: str) -> Workflow:
    return Workflow.model_validate(
        {"name": name, "steps": [{"job_type": job_type} for job_type in job_types or ("resize",)]}
    )


def _names() -> list[str]:
    return [workflow.name for workflow in list_workflows().workflows]


def _clear() -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM preferences WHERE key = ?", (WORKFLOWS_KEY,))
        conn.commit()


class WorkflowStoreTests(unittest.TestCase):
    def tearDown(self) -> None:
        _clear()

    def test_saved_workflows_are_sorted_ignoring_case(self) -> None:
        save_workflow(_workflow("prep"))
        save_workflow(_workflow("Captions"))

        self.assertEqual(_names(), ["Captions", "prep"])

    def test_same_name_ignoring_case_replaces(self) -> None:
        save_workflow(_workflow("Prep", "resize"))
        save_workflow(_workflow("prep", "strip_metadata"))

        [saved] = list_workflows().workflows
        self.assertEqual((saved.name, saved.steps[0].job_type), ("prep", "strip_metadata"))

    def test_a_rename_replaces_the_old_name(self) -> None:
        save_workflow(_workflow("Prep"))
        save_workflow(_workflow("Dataset prep"), previous_name="prep")

        self.assertEqual(_names(), ["Dataset prep"])

    def test_a_rename_onto_another_workflow_is_refused(self) -> None:
        save_workflow(_workflow("Prep"))
        save_workflow(_workflow("Captions"))

        with self.assertRaises(WorkflowNameTakenError):
            save_workflow(_workflow("captions"), previous_name="Prep")
        self.assertEqual(_names(), ["Captions", "Prep"])

    def test_limit_refuses_a_new_name_but_allows_replacing(self) -> None:
        with patch.object(job_workflows, "MAX_WORKFLOWS", 1):
            save_workflow(_workflow("one"))
            save_workflow(_workflow("ONE"))
            with self.assertRaises(TooManyWorkflowsError):
                save_workflow(_workflow("two"))

        self.assertEqual(_names(), ["ONE"])

    def test_delete_matches_ignoring_case_and_tolerates_missing(self) -> None:
        save_workflow(_workflow("Prep"))

        delete_workflow(" prep ")
        delete_workflow("missing")

        self.assertEqual(_names(), [])


class WorkflowValidationTests(unittest.TestCase):
    def tearDown(self) -> None:
        _clear()

    def _put(self, steps: list[dict[str, object]]):
        return client.put("/api/workflows", json={"workflow": {"name": "x", "steps": steps}})

    def test_rename_must_be_the_last_step(self) -> None:
        refused = self._put([{"job_type": "batch_rename"}, {"job_type": "resize"}])
        accepted = self._put([{"job_type": "resize"}, {"job_type": "batch_rename"}])

        self.assertEqual(refused.status_code, 422)
        self.assertIn("Rename must be the last step", refused.text)
        self.assertEqual(accepted.status_code, 200)

    def test_training_is_not_a_step(self) -> None:
        self.assertEqual(self._put([{"job_type": "train_lora"}]).status_code, 422)

    def test_a_workflow_needs_a_step(self) -> None:
        self.assertEqual(self._put([]).status_code, 422)

    def test_step_settings_are_checked_like_a_start(self) -> None:
        bad = self._put([{"job_type": "resize", "settings": {"megapixels": -1}}])
        self.assertEqual(bad.status_code, 422)

    def test_rename_onto_another_name_is_a_409(self) -> None:
        save_workflow(_workflow("Prep"))
        save_workflow(_workflow("Captions"))

        response = client.put(
            "/api/workflows",
            json={
                "workflow": {"name": "Captions", "steps": [{"job_type": "resize"}]},
                "previous_name": "Prep",
            },
        )
        self.assertEqual(response.status_code, 409)


def _finished() -> dict[str, object]:
    return {"total": 1, "processed": 1, "stats": {"success": 1}, "results": []}


class WorkflowRunTests(unittest.TestCase):
    def setUp(self) -> None:
        reset_job_manager()

    def tearDown(self) -> None:
        _clear()

    def _run(self, folder, name: str, paths: list[str] | None = None):
        return client.post(
            f"/api/workflows/run?path={quote(str(folder))}", json={"name": name, "paths": paths}
        )

    def test_a_run_queues_every_step_in_order_on_one_scope(self) -> None:
        received: list[tuple[str, object]] = []

        def recorder(job_type: str):
            def run(_folder, *, selected_paths=None, **_params):
                received.append((job_type, selected_paths))
                return _finished()

            return run

        save_workflow(
            Workflow.model_validate(
                {
                    "name": "Prep",
                    "steps": [
                        {"job_type": "strip_metadata"},
                        {"job_type": "find_duplicates", "settings": {"threshold": "exact"}},
                    ],
                }
            )
        )
        runners = {
            job_type: replace(JOB_SPECS[job_type], run=recorder(job_type))
            for job_type in ("strip_metadata", "find_duplicates")
        }
        with TempMediaFolder() as root, patch.dict(JOB_SPECS, runners):
            chosen = write_media(root, "a.png")
            write_media(root, "b.png")

            response = self._run(root, "prep", [str(chosen)])
            self.assertEqual(response.status_code, 200, response.text)
            jobs = response.json()["jobs"]
            for job in jobs:
                wait_for_job(job["id"])

        self.assertEqual([job["job_type"] for job in jobs], ["strip_metadata", "find_duplicates"])
        self.assertEqual([job["workflow_run"]["step"] for job in jobs], [1, 2])
        self.assertEqual({job["workflow_run"]["name"] for job in jobs}, {"Prep"})
        self.assertEqual(len({job["workflow_run"]["id"] for job in jobs}), 1)
        self.assertEqual(
            [job_type for job_type, _ in received], ["strip_metadata", "find_duplicates"]
        )
        self.assertTrue(all(paths == [chosen.resolve()] for _, paths in received))
        stored = job_manager.get_job(jobs[1]["id"])
        self.assertEqual(getattr(stored, "workflow_run", {}).get("steps"), 2)

    def test_an_invalid_first_step_queues_nothing(self) -> None:
        save_workflow(_workflow("Prep", "strip_metadata", "find_duplicates"))
        with TempMediaFolder() as root:
            response = self._run(root, "Prep")
            listed = client.get("/api/jobs").json()["jobs"]

        self.assertEqual(response.status_code, 400)
        self.assertEqual(listed, [])

    def test_a_later_step_is_validated_when_it_starts_not_up_front(self) -> None:
        validated: list[str] = []

        def validate(job_type: str):
            def check(_folder, **_params):
                validated.append(job_type)

            return check

        save_workflow(_workflow("Prep", "strip_metadata", "find_duplicates"))
        hold = {
            "strip_metadata": replace(
                JOB_SPECS["strip_metadata"],
                validate=validate("strip_metadata"),
                run=lambda *_a, **_k: _finished(),
            ),
            "find_duplicates": replace(
                JOB_SPECS["find_duplicates"],
                validate=validate("find_duplicates"),
                run=lambda *_a, **_k: _finished(),
            ),
        }
        with TempMediaFolder() as root, patch.dict(JOB_SPECS, hold):
            jobs = self._run(root, "Prep").json()["jobs"]
            self.assertEqual(validated[:1], ["strip_metadata"])
            for job in jobs:
                wait_for_job(job["id"])

        self.assertEqual(validated, ["strip_metadata", "find_duplicates"])

    def test_a_run_leaves_remembered_settings_alone(self) -> None:
        save_workflow(
            Workflow.model_validate(
                {
                    "name": "Dupes",
                    "steps": [{"job_type": "find_duplicates", "settings": {"threshold": "loose"}}],
                }
            )
        )
        finished = replace(JOB_SPECS["find_duplicates"], run=lambda *_a, **_k: _finished())
        with TempMediaFolder() as root, patch.dict(JOB_SPECS, {"find_duplicates": finished}):
            write_media(root, "a.png")
            before = get_automation_settings(folder_path=str(root)).find_duplicates
            [job] = self._run(root, "Dupes").json()["jobs"]
            wait_for_job(job["id"])
            after = get_automation_settings(folder_path=str(root)).find_duplicates

        self.assertEqual(before, after)

    def test_an_unknown_workflow_is_a_404(self) -> None:
        with TempMediaFolder() as root:
            self.assertEqual(self._run(root, "missing").status_code, 404)


class WorkflowQueueTests(unittest.TestCase):
    def setUp(self) -> None:
        reset_job_manager()

    def test_a_workflow_queues_after_the_running_job_and_stays_contiguous(self) -> None:
        import threading

        release = threading.Event()

        def held(_folder, *, should_cancel, **_params):
            while not release.wait(0.01):
                if should_cancel():
                    break
            return _finished()

        specs = {
            "set_captions": replace(JOB_SPECS["set_captions"], run=held),
            "strip_metadata": replace(
                JOB_SPECS["strip_metadata"], run=lambda *_a, **_k: _finished()
            ),
            "find_duplicates": replace(
                JOB_SPECS["find_duplicates"], run=lambda *_a, **_k: _finished()
            ),
        }
        with TempMediaFolder() as root, patch.dict(JOB_SPECS, specs):
            write_media(root, "a.png")
            running = job_manager.queue_job("set_captions", root, caption="x", overwrite=True)
            steps = job_manager.queue_workflow(
                root, [("strip_metadata", {}), ("find_duplicates", {})], "Prep"
            )
            later = job_manager.queue_job("strip_metadata", root)

            queued = [job.id for job in job_manager.queued_jobs(str(root))]
            release.set()
            for job in (running, *steps, later):
                wait_for_job(job.id)

        self.assertEqual(queued, [steps[0].id, steps[1].id, later.id])


if __name__ == "__main__":
    unittest.main()
