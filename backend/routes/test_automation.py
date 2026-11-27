from __future__ import annotations

import io
import json
import os
import tempfile
import unittest
from collections.abc import Callable, Generator
from contextlib import contextmanager
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch
from urllib.parse import quote

from PIL import Image

from automation.backup_captions import run_backup_captions_job
from automation.jobs import JOB_SPECS, job_manager
from automation.served_model import ServedModel
from automation.watermark import watermark_image_path
from automation_settings import AUTOMATION_SETTINGS_KEY_PREFIX, JOB_SETTINGS_MODELS
from comfy_settings import get_comfy_workflows_dir
from image_edit import apply_image_edit, read_image_edit_spec
from routes._test_client import client
from schemas import ColorAdjust, EditCropRect, ImageEditSpec
from testing_fixtures import (
    TempMediaFolder,
    forget_preferences,
    make_png_bytes,
    reset_job_manager,
    wait_for_job,
    write_caption_rules,
    write_image,
    write_media,
    write_sysprompt,
    write_txt_caption,
)

#: The shipped examples load no model, so a showcase start needs a preset of its own.
SHOWCASE_PRESET = {
    "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "base.safetensors"}},
    "3": {"class_type": "KSampler", "inputs": {"seed": 7, "model": ["1", 0]}},
    "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "out", "images": ["3", 0]}},
}

_presets = tempfile.TemporaryDirectory()
_previous_presets = os.environ.get("COMFY_WORKFLOWS_DIR")


def setUpModule() -> None:
    """The shipped presets plus a showcase one, for every start in this module."""
    folder = Path(_presets.name)
    for shipped in get_comfy_workflows_dir().glob("example_*.json"):
        (folder / shipped.name).write_bytes(shipped.read_bytes())
    (folder / "showcase_example.json").write_text(json.dumps(SHOWCASE_PRESET), encoding="utf-8")
    os.environ["COMFY_WORKFLOWS_DIR"] = str(folder)


def tearDownModule() -> None:
    if _previous_presets is None:
        os.environ.pop("COMFY_WORKFLOWS_DIR", None)
    else:
        os.environ["COMFY_WORKFLOWS_DIR"] = _previous_presets
    _presets.cleanup()


@contextmanager
def _patched_job_runner(job_type: str, run: Callable[..., object]) -> Generator[None]:
    """JOB_SPECS holds the function, so patching the module cannot swap it."""
    patched = replace(JOB_SPECS[job_type], run=run)
    with patch.dict(JOB_SPECS, {job_type: patched}):
        yield


def _capturing_runner(received: dict[str, object]) -> Callable[..., dict[str, object]]:
    def run(folder: Path, **params: object) -> dict[str, object]:
        received.update(params)
        return {"folder": str(folder), "total": 0, "processed": 0, "stats": {}, "results": []}

    return run


def _post(endpoint: str, folder: Path, body: dict[str, object] | None = None):
    return client.post(f"/api/automation/{endpoint}?path={quote(str(folder))}", json=body)


def _write_captioned_folder(folder: Path, *, video: bool = False) -> Path:
    """``video`` adds a placeholder clip."""
    write_sysprompt(folder, "# Describe the scene.")
    media = write_media(folder, "photo.png")
    write_txt_caption(media, "A lake.")
    if video:
        (folder / "walk.mp4").write_bytes(b"")
    return media


def _stored_settings(folder: Path) -> dict:
    response = client.get(f"/api/preferences/automation?path={quote(str(folder))}")
    assert response.status_code == 200, response.text
    return response.json()


# Keyed so persistence tests cover the registry.
_NON_DEFAULT_STARTS: dict[str, tuple[str, dict[str, object]]] = {
    "auto_caption": (
        "auto-caption",
        {
            "mode": "instruct",
            "reasoning_effort": "low",
            "preserve_thinking": False,
            "caption_audio": True,
        },
    ),
    "set_captions": ("set-captions", {"caption": "A mountain lake.", "overwrite": True}),
    "replace_captions": (
        "replace-captions",
        {
            "mode": "append",
            "search": "lake",
            "replacement": "river",
            "use_regex": True,
            "case_sensitive": True,
            "backup": False,
        },
    ),
    "backup_captions": ("backup-captions", {}),
    "verify_captions": (
        "verify-captions",
        {
            "mode": "thinking",
            "instruction": "Studio product shots.",
            "reasoning_effort": "low",
            "preserve_thinking": False,
            "sysprompt_placement": "after",
        },
    ),
    "edit_captions": (
        "edit-captions",
        {
            "mode": "thinking",
            "reasoning_effort": "low",
            "preserve_thinking": False,
            "instruction": "Rewrite in present tense.",
            "vision": True,
            "sysprompt_placement": "before",
            "backup": False,
        },
    ),
    "batch_rename": ("batch-rename", {"stem": "shot", "start_number": 7}),
    "find_duplicates": ("find-duplicates", {"threshold": "loose"}),
    "train_lora": (
        "train-lora",
        {
            "lora_name": "sample_train_v1",
            "trigger_word": "mtnstyle",
            "prompts": ["a mountain lake at sunrise"],
            "model": "h3_fl2va",
            "template": "config:\n  process:\n    - datasets:\n        - {}\n      sample: {}\n",
        },
    ),
    "watermark": (
        "watermark",
        {
            "text_enabled": True,
            "text": "Sample Studio",
            "size": "large",
            "opacity": 75,
            "position": "top_left",
            # Queueing would refuse it without a stored PNG.
            "image_enabled": False,
            "image_size": "large",
            "image_opacity": 25,
            "image_position": "bottom_left",
            "strip_metadata": True,
        },
    ),
    # The shipped generation example doubles as the fixture; it has no prompt node.
    "comfy_run": (
        "comfy-run",
        {
            "preset": "example_solid_color",
            "seed": 99,
            "prompt_text": "",
            "inputs": {"Color": 255},
            "overwrite_candidates": True,
            "count": 3,
            "name_prefix": "swatch",
            "caption_from_prompt": True,
        },
    ),
    "comfy_showcase": (
        "comfy-showcase",
        {
            "preset": "showcase_example",
            "items": [
                {
                    "label": "Beach",
                    "enabled": True,
                    "prompt_text": "",
                    "subject_strength": 0.8,
                    "loras": [{"name": "style.safetensors", "strength": 0.5, "enabled": True}],
                    "seed": 42,
                    "inputs": {},
                    "source_path": None,
                }
            ],
            "subject_loras": ["loras\\subject_000001000.safetensors"],
            "name_prefix": "show",
            "caption_from_prompt": True,
            "make_sheet": True,
        },
    ),
    "auto_adjust": ("auto-adjust", {"replace_adjustments": True}),
    "resize": ("resize", {"megapixels": 1.5, "multiple": 8, "frame_rate": 16}),
    "split_video": (
        "split-video",
        {
            "mode": "interval",
            "sensitivity": "high",
            "interval_seconds": 3.0,
            "longest_seconds": 8.0,
            "shortest_seconds": 0.5,
            "frame_rate": 24,
        },
    ),
    "trim_video": ("trim-video", {"max_seconds": 3.5, "keep": "middle", "reset_trim": True}),
}

#: Jobs that refuse a folder without a video.
_VIDEO_JOBS = {"split_video", "trim_video"}


class JobStartEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        reset_job_manager()
        self.addCleanup(forget_preferences, AUTOMATION_SETTINGS_KEY_PREFIX)

    def _start(self, job_type: str, folder: Path) -> tuple[dict, dict[str, object]]:
        endpoint, body = _NON_DEFAULT_STARTS[job_type]
        received: dict[str, object] = {}
        with _patched_job_runner(job_type, _capturing_runner(received)):
            response = _post(endpoint, folder, body)
            self.assertEqual(response.status_code, 200, response.text)
            wait_for_job(response.json()["id"])
        return response.json(), received

    def test_every_body_field_reaches_the_runner(self) -> None:
        for job_type, (_endpoint, body) in _NON_DEFAULT_STARTS.items():
            with self.subTest(job_type=job_type), TempMediaFolder() as root:
                _write_captioned_folder(root, video=job_type in _VIDEO_JOBS)

                payload, received = self._start(job_type, root)

                self.assertEqual(payload["job_type"], job_type)
                self.assertEqual({name: received[name] for name in body}, body)

    def test_an_empty_selection_is_refused_before_a_job_is_registered(self) -> None:
        with TempMediaFolder() as root:
            media = write_media(root, "photo.png")

            response = _post("set-captions", root, {"caption": "A lake.", "paths": []})

            self.assertEqual(response.status_code, 422)
            self.assertEqual(job_manager.list_jobs(), [])
            self.assertFalse((root / f"{media.stem}.txt").exists())

    def test_an_empty_selection_is_refused_by_a_preview(self) -> None:
        with TempMediaFolder() as root:
            write_txt_caption(write_media(root, "photo.png"), "a dog")

            response = _post(
                "replace-captions/preview",
                root,
                {"search": "dog", "replacement": "cat", "paths": []},
            )

            self.assertEqual(response.status_code, 422)

    def test_an_empty_body_starts_from_the_request_defaults(self) -> None:
        received: dict[str, object] = {}
        with (
            TempMediaFolder() as root,
            _patched_job_runner("auto_caption", _capturing_runner(received)),
        ):
            _write_captioned_folder(root)

            response = _post("auto-caption", root)
            wait_for_job(response.json()["id"])

        self.assertEqual(response.json()["auto_caption_mode"], "thinking")
        self.assertEqual(received["reasoning_effort"], "medium")
        self.assertIs(received["preserve_thinking"], True)
        self.assertIs(received["caption_audio"], False)

    def test_a_validator_refusal_becomes_a_400_with_its_reason(self) -> None:
        training = {"lora_name": "sample_train_v1", "prompts": ["a lake"]}
        cases = [
            ("auto-caption", {}, ".sysprompt"),
            ("check-caption-rules", {}, ".captionrules"),
            ("replace-captions", {"search": "(unclosed", "use_regex": True}, "Invalid regular"),
            ("backup-captions", {}, "No captions found to back up"),
            ("restore-captions", {}, "No caption backup found"),
            ("edit-captions", {"instruction": "   "}, "instruction"),
            ("watermark", {"text": "  "}, "cannot be empty"),
            ("train-lora", {**training, "lora_name": "..\\secrets"}, "LoRA name"),
            ("train-lora", {**training, "template": "a: [1, 2"}, "not valid YAML"),
        ]
        for endpoint, body, reason in cases:
            with self.subTest(endpoint=endpoint, reason=reason), TempMediaFolder() as root:
                write_media(root, "photo.png")

                response = _post(endpoint, root, body)

                self.assertEqual(response.status_code, 400)
                self.assertIn(reason, response.json()["detail"])

    def test_a_refused_start_does_not_store_the_settings(self) -> None:
        with TempMediaFolder() as root:
            write_media(root, "photo.png")

            refused = _post("watermark", root, {"text": "   ", "size": "large"})

            self.assertEqual(refused.status_code, 400)
            # A run that never happened must not be stored.
            self.assertEqual(_stored_settings(root)["watermark"]["size"], "medium")


class JobRunEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        reset_job_manager()

    def test_backup_captions_always_refreshes_existing_copies(self) -> None:
        for body in (None, {"overwrite": False}):
            with self.subTest(body=body), TempMediaFolder() as root:
                media = _write_captioned_folder(root)
                run_backup_captions_job(root)
                write_txt_caption(media, "A new caption.")

                response = _post("backup-captions", root, body)
                self.assertEqual(response.status_code, 200, response.text)
                job = wait_for_job(response.json()["id"])

                self.assertEqual(job.status, "completed")
                self.assertEqual(job.stats["success"], 1)
                self.assertEqual(
                    (root / ".backup" / "photo.txt").read_text(encoding="utf-8"), "A new caption."
                )

    def test_auto_adjust_resets_only_the_selected_files_color(self) -> None:
        with TempMediaFolder() as root:
            chosen = write_image(root, "chosen.png", width=80, height=40)
            other = write_image(root, "other.png", width=80, height=40)
            earlier = ImageEditSpec(
                crop=EditCropRect(x=0, y=0, width=0.5, height=1),
                adjust=ColorAdjust(exposure=0.3),
            )
            apply_image_edit(chosen, earlier)
            apply_image_edit(other, earlier)
            untouched = other.read_bytes()

            response = _post(
                "auto-adjust",
                root,
                {"paths": [str(chosen)], "reset_adjustments": True, "replace_adjustments": True},
            )
            self.assertEqual(response.status_code, 200)
            job = wait_for_job(response.json()["id"])

            self.assertEqual(job.status, "completed")
            self.assertEqual(job.stats["image_success"], 1)
            self.assertEqual(
                read_image_edit_spec(chosen), earlier.model_copy(update={"adjust": ColorAdjust()})
            )
            self.assertEqual(read_image_edit_spec(other), earlier)
            self.assertEqual(other.read_bytes(), untouched)

    def test_auto_adjust_adjusts_only_the_selection_and_keeps_its_original(self) -> None:
        with TempMediaFolder() as root:
            chosen = write_image(root, "dusk.png", color=(40, 32, 28))
            write_image(root, "noon.png", color=(40, 32, 28))

            response = _post("auto-adjust", root, {"paths": [str(chosen)]})

            job = wait_for_job(response.json()["id"])
            self.assertTrue((root / "dusk.png.bak").is_file())
            self.assertTrue((root / "dusk.png.edit.json").is_file())
            self.assertFalse((root / "noon.png.bak").exists())

        self.assertEqual(job.status, "completed")
        self.assertEqual(job.stats["image_success"], 1)

    def test_check_caption_rules_records_the_hits(self) -> None:
        with TempMediaFolder() as root:
            write_caption_rules(root, "flag:\n  - match: [float*]\n")
            write_txt_caption(write_media(root, "photo.png"), "A balloon floating over the hills.")

            response = _post("check-caption-rules", root)
            job = wait_for_job(response.json()["id"])

        self.assertEqual(job.status, "completed")
        self.assertEqual(job.stats["issues_found"], 1)

    def test_restore_starts_once_a_backup_exists(self) -> None:
        with TempMediaFolder() as root:
            write_txt_caption(write_media(root, "photo.png"), "A plain caption.")
            run_backup_captions_job(root)

            response = _post("restore-captions", root)
            wait_for_job(response.json()["id"])

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["job_type"], "restore_captions")

    def test_train_lora_co_tracks_the_external_run(self) -> None:
        def finished(folder: Path, **_params: object) -> dict[str, object]:
            return {
                "folder": str(folder),
                "total": 1000,
                "processed": 1000,
                "stats": {"step": 1000, "stopped": 0},
                "results": [],
            }

        with TempMediaFolder() as root, _patched_job_runner("train_lora", finished):
            write_media(root, "photo.png")

            response = _post(
                "train-lora", root, {"lora_name": "sample_train_v1", "prompts": ["a lake"]}
            )
            job = wait_for_job(response.json()["id"])

        self.assertEqual(response.json()["external_ref"], "sample_train_v1")
        self.assertEqual(job.status, "completed")
        self.assertEqual(job_manager.get_job(job.id).external_ref, "sample_train_v1")


class ReplaceCaptionsPreviewEndpointTests(unittest.TestCase):
    def test_preview_reports_matches(self) -> None:
        with TempMediaFolder() as root:
            write_txt_caption(write_media(root, "photo.png"), "a dog")

            response = _post(
                "replace-captions/preview", root, {"search": "dog", "replacement": "cat"}
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["matched"], 1)
        self.assertIsNone(payload["error"])
        self.assertEqual(payload["samples"][0]["after"], "a cat")

    def test_preview_reports_a_bad_edit_as_a_field_not_a_400(self) -> None:
        """A half-typed regex is normal."""
        with TempMediaFolder() as root:
            write_media(root, "photo.png")

            response = _post(
                "replace-captions/preview", root, {"search": "(unclosed", "use_regex": True}
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("Invalid regular expression", payload["error"])
        self.assertEqual(payload["matched"], 0)


class RestoreCaptionsPreviewEndpointTests(unittest.TestCase):
    def test_lists_the_captions_a_restore_would_change(self) -> None:
        with TempMediaFolder() as root:
            media = write_media(root, "photo.png")
            write_txt_caption(media, "A plain caption.")
            run_backup_captions_job(root)
            write_txt_caption(media, "An edited caption.")

            response = _post("restore-captions/preview", root)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["changed"], 1)
        [sample] = response.json()["samples"]
        self.assertEqual(
            {key: sample[key] for key in ("name", "path", "backup", "current", "error")},
            {
                "name": "photo.png",
                "path": str(media),
                "backup": "A plain caption.",
                "current": "An edited caption.",
                "error": None,
            },
        )

    def test_a_folder_without_a_backup_is_a_400(self) -> None:
        with TempMediaFolder() as root:
            write_txt_caption(write_media(root, "photo.png"), "A plain caption.")

            response = _post("restore-captions/preview", root)

        self.assertEqual(response.status_code, 400)


class EditCaptionsPreviewEndpointTests(unittest.TestCase):
    def test_previews_three_readable_captions_without_writing_or_starting_a_job(self) -> None:
        original = "A person walked along a quiet street beside a stone wall."
        edited = "A person walks along a quiet street beside a stone wall."
        with TempMediaFolder() as root:
            write_media(root, "a-uncaptioned.png")
            for name in ("b.png", "c.png", "d.png", "e.png"):
                write_txt_caption(write_media(root, name), original)
            before = {path: (path.read_bytes(), path.stat().st_mtime_ns) for path in root.iterdir()}
            preferences = _stored_settings(root)
            with (
                patch("automation.edit_captions.edit_caption", return_value=edited) as model,
                patch.object(job_manager, "queue_job") as queue,
                # A model server left running on this machine would answer otherwise.
                patch("automation.served_model.read_served_model", return_value=ServedModel()),
            ):
                response = _post(
                    "edit-captions/preview",
                    root,
                    {
                        "instruction": "  Rewrite in present tense.  ",
                        "mode": "thinking",
                        "reasoning_effort": "low",
                        "preserve_thinking": False,
                    },
                )

            self.assertEqual(response.status_code, 200, response.text)
            samples = response.json()["samples"]
            self.assertEqual([sample["name"] for sample in samples], ["b.png", "c.png", "d.png"])
            self.assertTrue(all(sample["before"] == original for sample in samples))
            self.assertTrue(all(sample["after"] == edited for sample in samples))
            self.assertEqual(model.call_count, 3)
            settings = model.call_args.kwargs["settings"]
            self.assertEqual(settings.mode, "thinking")
            self.assertEqual(settings.effort, "low")
            self.assertFalse(settings.preserve_thinking)
            self.assertIn("# Edit to apply\nRewrite in present tense.", model.call_args.args[1])
            queue.assert_not_called()
            self.assertEqual(_stored_settings(root), preferences)
            self.assertEqual(
                {path: (path.read_bytes(), path.stat().st_mtime_ns) for path in root.iterdir()},
                before,
            )

    def test_honours_selection_and_reports_unchanged_captions(self) -> None:
        with TempMediaFolder() as root:
            first = _write_captioned_folder(root)
            second = write_media(root, "second.png")
            write_txt_caption(second, "A river.")
            with patch("automation.edit_captions.edit_caption", return_value="A river.") as model:
                response = _post(
                    "edit-captions/preview",
                    root,
                    {
                        "instruction": "Rewrite in present tense.",
                        "paths": [str(second)],
                    },
                )
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(
                response.json()["samples"],
                [
                    {
                        "name": "second.png",
                        "before": "A river.",
                        "after": "A river.",
                        "error": None,
                    }
                ],
            )
            self.assertEqual(model.call_count, 1)
            self.assertTrue(first.with_suffix(".txt").exists())

    def test_failed_model_outputs_are_reported_without_becoming_proposed_edits(self) -> None:
        with TempMediaFolder() as root:
            write_txt_caption(
                write_media(root, "photo.png"),
                "A person walked along a quiet street beside a stone wall.",
            )
            for reply, message in (("Yes.", "too little text"), (None, "Model request failed")):
                with (
                    self.subTest(reply=reply),
                    patch(
                        "automation.edit_captions.edit_caption",
                        return_value=reply,
                    ),
                ):
                    response = _post(
                        "edit-captions/preview",
                        root,
                        {
                            "instruction": "Rewrite in present tense.",
                        },
                    )
                    self.assertEqual(response.status_code, 200, response.text)
                    sample = response.json()["samples"][0]
                    self.assertIsNone(sample["after"])
                    self.assertIn(message, sample["error"])

    def test_requires_an_instruction_and_handles_a_folder_without_captions(self) -> None:
        with TempMediaFolder() as root:
            write_media(root, "photo.png")
            with patch("automation.edit_captions.edit_caption") as model:
                self.assertEqual(_post("edit-captions/preview", root, {}).status_code, 400)
                response = _post("edit-captions/preview", root, {"instruction": "Drop colours."})
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json()["samples"], [])
                model.assert_not_called()


class TrainingTemplateEndpointTests(unittest.TestCase):
    def test_returns_the_new_image_model_templates(self) -> None:
        for model, architecture in (
            ("krea2_raw", "krea2"),
            ("moss_image_sft", "moss_image"),
            ("qwen_image_2_turbo", "qwen_image_2:turbo"),
        ):
            with self.subTest(model=model):
                response = client.get(
                    "/api/automation/train-lora/template", params={"model": model}
                )

                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json()["model"], model)
                self.assertIn(f'arch: "{architecture}"', response.json()["yaml"])

    def test_returns_the_template_as_written(self) -> None:
        response = client.get("/api/automation/train-lora/template?model=h3_fl2va")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["model"], "h3_fl2va")
        # The comments are half of what makes it editable.
        self.assertIn('arch: "minimax_h3"', payload["yaml"])

    def test_defaults_to_the_krea2_turbo_template(self) -> None:
        response = client.get("/api/automation/train-lora/template")

        self.assertEqual(response.json()["model"], "krea2_turbo")
        self.assertIn("krea/Krea-2-Turbo", response.json()["yaml"])

    def test_rejects_a_model_with_no_template(self) -> None:
        response = client.get("/api/automation/train-lora/template?model=no_such_model")

        self.assertEqual(response.status_code, 422)

    def test_a_usable_edit_checks_out(self) -> None:
        template = client.get("/api/automation/train-lora/template").json()["yaml"]

        response = client.post(
            "/api/automation/train-lora/template/check", json={"template": template}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"ok": True, "error": None})

    def test_a_broken_edit_answers_200_with_the_reason(self) -> None:
        """An unparseable draft is an expected answer."""
        response = client.post(
            "/api/automation/train-lora/template/check", json={"template": "a: [1, 2"}
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(payload["ok"])
        self.assertIn("edited training template", payload["error"])


def _png_bytes(size: tuple[int, int] = (40, 20)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGBA", size, (255, 0, 0, 255)).save(buffer, format="PNG")
    return buffer.getvalue()


def _upload_watermark(content: bytes, name: str = "logo.png"):
    return client.put(
        "/api/automation/watermark/image", files={"file": (name, content, "image/png")}
    )


class WatermarkImageEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        reset_job_manager()
        watermark_image_path().unlink(missing_ok=True)
        self.addCleanup(watermark_image_path().unlink, missing_ok=True)

    def test_nothing_is_stored_until_an_upload(self) -> None:
        self.assertEqual(
            client.get("/api/automation/watermark/image/info").json(),
            {"available": False, "width": 0, "height": 0, "revision": 0},
        )
        self.assertEqual(client.get("/api/automation/watermark/image").status_code, 404)

    def test_an_uploaded_png_is_described_and_served_back(self) -> None:
        content = _png_bytes((40, 20))

        uploaded = _upload_watermark(content)

        self.assertEqual(uploaded.status_code, 200)
        info = uploaded.json()
        self.assertEqual((info["available"], info["width"], info["height"]), (True, 40, 20))
        self.assertEqual(client.get("/api/automation/watermark/image/info").json(), info)
        served = client.get("/api/automation/watermark/image")
        self.assertEqual(served.status_code, 200)
        self.assertEqual(served.headers["content-type"], "image/png")
        self.assertEqual(served.headers["cache-control"], "no-store")
        self.assertEqual(served.content, content)

    def test_a_new_upload_replaces_the_old_one(self) -> None:
        _upload_watermark(_png_bytes((40, 20)))

        replaced = _upload_watermark(_png_bytes((10, 30)))

        self.assertEqual((replaced.json()["width"], replaced.json()["height"]), (10, 30))

    def test_refuses_anything_but_a_png(self) -> None:
        jpeg = io.BytesIO()
        Image.new("RGB", (8, 8)).save(jpeg, format="JPEG")
        cases = {
            "a JPEG named .png": (jpeg.getvalue(), "must be a PNG"),
            "not an image": (b"not a png", "not a readable PNG"),
            "a truncated PNG": (_png_bytes((64, 64))[:60], "not a readable PNG"),
        }
        for label, (content, reason) in cases.items():
            with self.subTest(label):
                response = _upload_watermark(content)

                self.assertEqual(response.status_code, 400)
                self.assertIn(reason, response.json()["detail"])
                self.assertFalse(watermark_image_path().exists())

    def test_refuses_an_oversized_upload(self) -> None:
        with patch("automation.watermark.MAX_WATERMARK_IMAGE_BYTES", 100):
            response = _upload_watermark(_png_bytes((200, 200)) + b"\0" * 200)

        self.assertEqual(response.status_code, 400)
        self.assertIn("larger than", response.json()["detail"])

    def test_a_png_only_job_queues_once_a_png_is_stored(self) -> None:
        with TempMediaFolder() as root:
            write_media(root, "photo.png")
            body = {"text_enabled": False, "image_enabled": True}

            refused = _post("watermark", root, body)
            self.assertEqual(refused.status_code, 400)
            self.assertIn("Choose a PNG watermark first", refused.json()["detail"])

            _upload_watermark(_png_bytes())
            received: dict[str, object] = {}
            with _patched_job_runner("watermark", _capturing_runner(received)):
                queued = _post("watermark", root, body)
                wait_for_job(queued.json()["id"])

            self.assertEqual(queued.status_code, 200)
            self.assertIs(received["image_enabled"], True)
            self.assertIs(received["text_enabled"], False)


class ComfyPresetsEndpointTests(unittest.TestCase):
    def test_lists_the_presets_on_disk(self) -> None:
        with patch("routes.automation.probe_available", return_value=True):
            response = client.get("/api/automation/comfy-process/presets")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("example_lanczos_2x", [preset["name"] for preset in payload["presets"]])
        self.assertTrue(payload["available"])
        generates = {preset["name"]: preset["generates"] for preset in payload["presets"]}
        self.assertIs(generates["example_lanczos_2x"], False)
        self.assertIs(generates["example_solid_color"], True)

    def test_names_the_origin_it_probed(self) -> None:
        """Must tell a stopped ComfyUI from a wrong port."""
        for available, configured, expected in (
            (False, "http://127.0.0.1:9123", "http://127.0.0.1:9123"),
            (True, "http://gpu-box:8188/", "http://gpu-box:8188"),
        ):
            with (
                self.subTest(available=available),
                patch("routes.automation.probe_available", return_value=available),
                patch.dict(os.environ, {"COMFY_BASE_URL": configured}),
            ):
                payload = client.get("/api/automation/comfy-process/presets").json()

                self.assertEqual(payload["available"], available)
                self.assertEqual(payload["base_url"], expected)


#: The face pass runs only when "DataForge Detail" is on.
SWITCHED_PRESET: dict[str, dict] = {
    "4": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "base.safetensors"}},
    "6": {"class_type": "CLIPTextEncode", "inputs": {"text": "a lighthouse", "clip": ["4", 1]}},
    "5": {"class_type": "EmptyLatentImage", "inputs": {"width": 512, "height": 512}},
    "3": {
        "class_type": "KSampler",
        "inputs": {
            "seed": 1,
            "steps": 20,
            "model": ["4", 0],
            "positive": ["6", 0],
            "latent_image": ["5", 0],
        },
    },
    "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
    "20": {
        "class_type": "FaceDetailer",
        "inputs": {"steps": 6, "sampler_name": "lcm", "image": ["8", 0], "model": ["4", 0]},
    },
    "21": {
        "class_type": "PrimitiveBoolean",
        "inputs": {"value": False},
        "_meta": {"title": "DataForge Detail"},
    },
    "22": {
        "class_type": "ComfySwitchNode",
        "inputs": {"switch": ["21", 0], "on_true": ["20", 0], "on_false": ["8", 0]},
    },
    "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "out", "images": ["22", 0]}},
}


class ComfyPresetMapEndpointTests(unittest.TestCase):
    def test_maps_a_shipped_preset_with_its_source_marked(self) -> None:
        response = client.post(
            "/api/automation/comfy-process/map", json={"preset": "example_lanczos_2x"}
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIsNone(payload["error"])
        boxes = {node["kind"]: node for node in payload["branch"]["map"]}
        self.assertEqual(boxes["input"]["label"], "Each source file")
        self.assertEqual(boxes["input"]["feeds"], [boxes["output"]["id"]])

    def test_a_generation_draws_the_source_loader_as_its_start_file(self) -> None:
        response = client.post(
            "/api/automation/comfy-process/map",
            json={"preset": "example_lanczos_2x", "mode": "generate"},
        )

        boxes = {node["kind"]: node for node in response.json()["branch"]["map"]}
        self.assertEqual(boxes["input"]["label"], "Start file")

    def test_a_broken_preset_answers_with_its_reason(self) -> None:
        with tempfile.TemporaryDirectory() as presets:
            Path(presets, "editor.json").write_text('{"nodes": [], "links": []}', encoding="utf-8")
            with patch.dict(os.environ, {"COMFY_WORKFLOWS_DIR": presets}):
                response = client.post(
                    "/api/automation/comfy-process/map", json={"preset": "editor"}
                )

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["branch"])
        self.assertIn("API-format", response.json()["error"])

    def test_a_missing_preset_is_a_404(self) -> None:
        response = client.post(
            "/api/automation/comfy-process/map", json={"preset": "no-such-preset"}
        )

        self.assertEqual(response.status_code, 404)

    def test_an_edited_switch_draws_the_branch_it_picks(self) -> None:
        with tempfile.TemporaryDirectory() as presets:
            Path(presets, "switched.json").write_text(json.dumps(SWITCHED_PRESET), encoding="utf-8")
            with patch.dict(os.environ, {"COMFY_WORKFLOWS_DIR": presets}):
                statuses = {}
                for body in ({}, {"Detail": True}, {"Detail": "not a boolean"}):
                    response = client.post(
                        "/api/automation/comfy-process/map",
                        json={"preset": "switched", "inputs": body},
                    )
                    self.assertEqual(response.status_code, 200)
                    passes = response.json()["branch"]["map"]
                    statuses[str(body)] = {
                        node["id"]: node["status"] for node in passes if node["kind"] == "pass"
                    }

        self.assertEqual(statuses["{}"], {"3": "ran", "20": "switched_off"})
        self.assertEqual(statuses["{'Detail': True}"], {"3": "ran", "20": "ran"})
        self.assertEqual(statuses["{'Detail': 'not a boolean'}"], statuses["{}"])

    def test_maps_a_files_own_workflow_with_its_inputs(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            media = Path(raw, "made.png")
            media.write_bytes(make_png_bytes(text_chunks={"prompt": json.dumps(SWITCHED_PRESET)}))
            response = client.post(
                "/api/automation/comfy-process/map",
                json={
                    "source": {"path": str(media), "node_id": "9"},
                    "inputs": {"Detail": True},
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["error"])
        passes = [node for node in response.json()["branch"]["map"] if node["kind"] == "pass"]
        self.assertEqual({node["status"] for node in passes}, {"ran"})


class ComfyLogsEndpointTests(unittest.TestCase):
    def test_serves_the_tail_of_comfy_output(self) -> None:
        with patch("routes.automation.read_log_lines", return_value=["Phase 3", "done"]):
            response = client.get("/api/automation/comfy-process/logs")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"lines": ["Phase 3", "done"], "available": True})

    def test_unreadable_and_empty_logs_are_both_a_200_but_say_different_things(self) -> None:
        """A stopped or older ComfyUI leaves the panel quiet."""
        for lines, available in ((None, False), ([], True)):
            with (
                self.subTest(lines=lines),
                patch("routes.automation.read_log_lines", return_value=lines),
            ):
                response = client.get("/api/automation/comfy-process/logs")

                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json(), {"lines": [], "available": available})


class JobSettingsPersistenceTests(unittest.TestCase):
    def setUp(self) -> None:
        reset_job_manager()
        self.addCleanup(forget_preferences, AUTOMATION_SETTINGS_KEY_PREFIX)

    def test_the_table_covers_every_job_that_registers_settings(self) -> None:
        self.assertLessEqual(
            set(JOB_SETTINGS_MODELS) | {"comfy_run"},
            set(_NON_DEFAULT_STARTS),
        )

    def _run(self, job_type: str, folder: Path, start: tuple[str, dict] | None = None) -> dict:
        endpoint, body = start or _NON_DEFAULT_STARTS[job_type]
        _write_captioned_folder(folder, video=job_type in _VIDEO_JOBS)

        with _patched_job_runner(job_type, _capturing_runner({})):
            response = _post(endpoint, folder, body)
            self.assertEqual(response.status_code, 200, response.text)
            wait_for_job(response.json()["id"])

        return body

    def test_every_job_remembers_its_settings_for_the_folder_it_ran_in(self) -> None:
        for job_type, model in JOB_SETTINGS_MODELS.items():
            with self.subTest(job_type=job_type), TempMediaFolder() as root:
                body = self._run(job_type, root)

                stored = _stored_settings(root)[job_type]
                remembered = {
                    name: value for name, value in body.items() if name in model.model_fields
                }
                self.assertEqual(stored, remembered)
                # Fields outside the settings model are never stored.
                self.assertEqual(set(stored), set(model.model_fields))

    def test_a_folder_with_no_run_of_its_own_starts_from_the_last_one(self) -> None:
        for job_type, model in JOB_SETTINGS_MODELS.items():
            with self.subTest(job_type=job_type):
                with TempMediaFolder() as used:
                    body = self._run(job_type, used)
                with TempMediaFolder() as fresh:
                    stored = _stored_settings(fresh)[job_type]

                self.assertEqual(
                    stored,
                    {name: value for name, value in body.items() if name in model.model_fields},
                )

    def test_a_comfy_edit_remembers_its_seed_under_the_preset(self) -> None:
        # The shipped example loads a source file and has no prompt node.
        edit = ("comfy-run", {"preset": "example_lanczos_2x", "seed": 1234, "prompt_text": ""})
        with TempMediaFolder() as root:
            body = self._run("comfy_run", root, edit)

            self.assertEqual(
                _stored_settings(root)["comfy_run"],
                {
                    "preset": body["preset"],
                    "overwrite_candidates": False,
                    "count": 1,
                    "name_prefix": "",
                    "caption_from_prompt": False,
                    "by_preset": {
                        body["preset"]: {
                            "seed": body["seed"],
                            "prompt_text": body["prompt_text"],
                            "inputs": {},
                            "mode": None,
                        }
                    },
                },
            )

    def test_a_comfy_generation_remembers_its_prompt_per_preset_and_its_output_not_seed(
        self,
    ) -> None:
        with TempMediaFolder() as root:
            body = self._run("comfy_run", root)

            self.assertEqual(
                _stored_settings(root)["comfy_run"],
                {
                    "preset": body["preset"],
                    "overwrite_candidates": body["overwrite_candidates"],
                    "count": body["count"],
                    "name_prefix": body["name_prefix"],
                    "caption_from_prompt": body["caption_from_prompt"],
                    "by_preset": {
                        body["preset"]: {
                            # A remembered seed would repeat the last images.
                            "seed": None,
                            "prompt_text": body["prompt_text"],
                            "inputs": body["inputs"],
                            "mode": None,
                        }
                    },
                },
            )

    def test_set_captions_overwrite_is_not_remembered(self) -> None:
        with TempMediaFolder() as root:
            self._run("set_captions", root)

            self.assertNotIn("overwrite", _stored_settings(root)["set_captions"])


_PROMPT_PRESET = {
    "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "model.safetensors"}},
    "2": {
        "class_type": "CLIPTextEncode",
        "inputs": {"text": "a lighthouse", "clip": ["1", 1]},
        "_meta": {"title": "DataForge Prompt"},
    },
    "3": {"class_type": "EmptyLatentImage", "inputs": {"width": 512, "height": 512}},
    "4": {
        "class_type": "KSampler",
        "inputs": {
            "model": ["1", 0],
            "positive": ["2", 0],
            "latent_image": ["3", 0],
            "seed": 7,
            "steps": 20,
        },
    },
    "5": {"class_type": "VAEDecode", "inputs": {"samples": ["4", 0], "vae": ["1", 2]}},
    "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "out", "images": ["5", 0]}},
}


class ComfyPresetMapRunValuesTests(unittest.TestCase):
    def _map(self, **body: object) -> dict:
        with tempfile.TemporaryDirectory() as presets:
            Path(presets, "txt2img.json").write_text(json.dumps(_PROMPT_PRESET), encoding="utf-8")
            with patch.dict(os.environ, {"COMFY_WORKFLOWS_DIR": presets}):
                response = client.post(
                    "/api/automation/comfy-process/map", json={"preset": "txt2img", **body}
                )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["branch"]

    def test_the_typed_prompt_and_seed_are_drawn_as_they_will_run(self) -> None:
        branch = self._map(prompt_text="a harbour at night", seed=42)

        prompt = next(box for box in branch["map"] if box["kind"] == "prompt")
        self.assertIn("a harbour at night", " ".join([prompt["label"], *prompt["detail"]]))
        self.assertNotIn("a lighthouse", " ".join([prompt["label"], *prompt["detail"]]))
        seeds = [p["value"] for p in branch["parameters"] if p["label"] == "Seed"]
        self.assertEqual(seeds, ["42"])

    def test_an_empty_prompt_draws_the_saved_text(self) -> None:
        branch = self._map()

        prompt = next(box for box in branch["map"] if box["kind"] == "prompt")
        self.assertIn("a lighthouse", " ".join([prompt["label"], *prompt["detail"]]))

    def test_the_chosen_start_file_names_the_loader(self) -> None:
        with tempfile.TemporaryDirectory() as presets:
            Path(presets, "i2v.json").write_text(
                json.dumps(
                    {
                        "1": {"class_type": "LoadImage", "inputs": {"image": "x.png"}},
                        "9": {
                            "class_type": "SaveImage",
                            "inputs": {"filename_prefix": "out", "images": ["1", 0]},
                        },
                    }
                ),
                encoding="utf-8",
            )
            with patch.dict(os.environ, {"COMFY_WORKFLOWS_DIR": presets}):
                response = client.post(
                    "/api/automation/comfy-process/map",
                    json={
                        "preset": "i2v",
                        "mode": "generate",
                        "start_path": "C:/renders/start.png",
                    },
                )

        boxes = {box["kind"]: box for box in response.json()["branch"]["map"]}
        self.assertEqual(boxes["input"]["label"], "start.png")


if __name__ == "__main__":
    unittest.main()
