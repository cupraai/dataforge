from __future__ import annotations

from testing_fixtures import isolate_test_database

isolate_test_database()

import io
import json
import threading
import time
import unittest
from collections.abc import Callable
from contextlib import suppress
from unittest.mock import patch

import httpx
from PIL import Image

import edit_sidecars
import image_edit
import image_fill_jobs
from app_settings import update_app_settings
from image_fill import FillUnavailableError, file_digest, load_result, save_result
from image_fill_jobs import (
    FillInProgressError,
    cancel_fill_operation,
    get_fill_operation,
    start_fill,
)
from image_fill_workflow import DEFAULT_FILL_INSTRUCTION
from schemas import AppSettingsUpdate, FillBox, ImageEditSpec, ImageFillRequest
from test_image_fill import ResultsFolder, make_fill, mask_png, painted, solid_asset
from testing_fixtures import TempMediaFolder, forget_saved_settings, mock_comfy_client

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def uploaded_image(request: httpx.Request) -> Image.Image:
    """The PNG inside a multipart upload; Pillow stops reading at its IEND."""
    content = request.content
    with Image.open(io.BytesIO(content[content.index(PNG_SIGNATURE) :])) as opened:
        opened.load()
        return opened.copy()


class FakeComfy:
    """Answers the endpoints one fill uses, finishing the prompt after ``polls`` history reads."""

    def __init__(
        self,
        *,
        polls: int = 1,
        queue: Callable[[], dict] | None = None,
        output: Callable[[Image.Image], Image.Image] | None = None,
    ) -> None:
        self.polls = polls
        self.queue = queue or (lambda: {"queue_running": [[0, "p-1", {}]], "queue_pending": []})
        self.output = output or (lambda source: Image.new("RGB", source.size, (255, 0, 255)))
        self.uploads: list[Image.Image] = []
        self.prompts: list[dict] = []
        self.calls: list[tuple[str, str]] = []
        self.interrupted: list[dict] = []
        self.deleted: list[dict] = []
        self.history_reads = 0
        self.statuses: list[str] = []
        self.operation_id: str | None = None

    def handler(self, request: httpx.Request) -> httpx.Response:
        path, method = request.url.path, request.method
        self.calls.append((method, path))
        if path == "/upload/image":
            self.uploads.append(uploaded_image(request))
            return httpx.Response(200, json={"name": f"u{len(self.uploads)}.png", "subfolder": ""})
        if path == "/prompt":
            self.prompts.append(json.loads(request.content)["prompt"])
            return httpx.Response(200, json={"prompt_id": "p-1"})
        if path == "/queue" and method == "GET":
            return httpx.Response(200, json=self.queue())
        if path == "/queue":
            self.deleted.append(json.loads(request.content))
            return httpx.Response(200, json={})
        if path == "/interrupt":
            self.interrupted.append(json.loads(request.content))
            return httpx.Response(200, json={})
        if path == "/history/p-1":
            self.history_reads += 1
            if self.operation_id is not None:
                operation = get_fill_operation(self.operation_id)
                if operation is not None:
                    self.statuses.append(operation.status)
            if self.history_reads <= self.polls:
                return httpx.Response(200, json={})
            entry = {
                "status": {"completed": True, "status_str": "success"},
                "outputs": {
                    "14": {"images": [{"filename": "out.png", "subfolder": "", "type": "output"}]}
                },
            }
            return httpx.Response(200, json={"p-1": entry})
        if path == "/view":
            buffer = io.BytesIO()
            self.output(self.uploads[0]).save(buffer, format="PNG")
            return httpx.Response(200, content=buffer.getvalue())
        return httpx.Response(404, json={})


def wait_until_finished(operation_id: str, timeout: float = 10.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        operation = get_fill_operation(operation_id)
        if operation is not None and operation.finished:
            return operation
        time.sleep(0.01)
    raise AssertionError(f"Fill {operation_id} did not finish")


def refused(request: httpx.Request) -> httpx.Response:
    raise httpx.ConnectError("refused", request=request)


class FillJobCase(ResultsFolder):
    def setUp(self) -> None:
        super().setUp()
        forget_saved_settings()
        # For the whole test: a worker thread opens its client after start_fill returns, and an
        # unpatched one would reach whatever ComfyUI runs on this machine.
        self.comfy_handler: Callable[[httpx.Request], httpx.Response] = refused
        comfy = patch(
            "image_fill_jobs.open_comfy_client",
            lambda _timeout: mock_comfy_client(lambda request: self.comfy_handler(request)),
        )
        comfy.start()
        self.addCleanup(comfy.stop)
        with image_fill_jobs._lock:
            image_fill_jobs._operations.clear()
        poll = patch("external.comfy_execution.COMFY_POLL_INTERVAL_SECONDS", 0.01)
        poll.start()
        self.addCleanup(poll.stop)
        self.folder = TempMediaFolder()
        self.root = self.folder.__enter__()
        self.addCleanup(self.folder.__exit__, None, None, None)
        self.media = self.root / "scene.png"
        Image.new("RGB", (400, 300), (20, 40, 60)).save(self.media)

    def tearDown(self) -> None:
        # A thread still polling a fake that never finishes would outlive the test.
        with image_fill_jobs._lock:
            operations = list(image_fill_jobs._operations.values())
        for operation in operations:
            operation.cancel_requested.set()
        for operation in operations:
            with suppress(AssertionError):
                wait_until_finished(operation.id)

    def request(self, **changes) -> ImageFillRequest:
        values = {
            "mask_png": mask_png(painted((400, 300), (150, 100, 220, 160))),
            "preset": "quality",
            "seed": 1234,
            **changes,
        }
        return ImageFillRequest.model_validate(values)

    def run_fill(
        self,
        fake: FakeComfy,
        request: ImageFillRequest | None = None,
        *,
        handler: Callable[[httpx.Request], httpx.Response] | None = None,
    ):
        self.comfy_handler = handler or fake.handler
        operation = start_fill(self.media, request or self.request())
        fake.operation_id = operation.id
        return wait_until_finished(operation.id)


class SuccessTests(FillJobCase):
    def test_a_generation_stores_its_patch_and_reports_the_fill(self) -> None:
        fake = FakeComfy(polls=2)

        operation = self.run_fill(fake)

        self.assertEqual(operation.status, "succeeded", operation.error)
        fill = operation.fill
        assert fill is not None
        self.assertIsNone(fill.parent_id)
        self.assertEqual(fill.seed, 1234)
        self.assertEqual(fill.source_digest, file_digest(self.media))
        self.assertTrue(fill.workflow.startswith("qwen21_fill_quality@"))
        stored = load_result(self.media, fill.id)
        assert stored is not None
        self.assertEqual(
            stored.generated.getpixel((stored.blend.width // 2, stored.blend.height // 2)),
            (255, 0, 255, 255),
        )
        # Running is reported once ComfyUI picks the prompt up, not merely when it is queued.
        self.assertIn("running", fake.statuses)

    def test_the_prompt_carries_the_mask_models_steps_cfg_and_seed(self) -> None:
        fake = FakeComfy()

        self.run_fill(fake, self.request(instruction="a wooden bench."))

        prompt = fake.prompts[0]
        by_class = {node["class_type"]: node["inputs"] for node in prompt.values()}
        self.assertEqual(by_class["LoadImage"]["image"], "u1.png")
        self.assertEqual(by_class["LoadImageMask"]["image"], "u2.png")
        self.assertEqual(
            by_class["UNETLoader"]["unet_name"], "qwen_image_2.1_int8_convrot.safetensors"
        )
        self.assertIn("a wooden bench", by_class["TextEncodeQwenImage21"]["prompt"])
        self.assertNotIn("LoraLoaderModelOnly", by_class)
        titled = {node.get("_meta", {}).get("title"): node["inputs"] for node in prompt.values()}
        self.assertEqual(titled["DataForge Seed"]["value"], 1234)
        self.assertEqual(titled["DataForge Steps"]["value"], 30)
        self.assertEqual(by_class["KSampler"]["cfg"], 3.0)
        # The mask that went up is binary and the size of the image beside it.
        image, mask = fake.uploads
        self.assertEqual(image.size, mask.size)
        self.assertEqual(set(mask.convert("L").get_flattened_data()), {0, 255})

    def test_a_saved_quality_cfg_reaches_the_sampler(self) -> None:
        update_app_settings(AppSettingsUpdate(fill_quality_cfg=5.5))
        fake = FakeComfy()

        self.run_fill(fake)

        by_class = {node["class_type"]: node["inputs"] for node in fake.prompts[0].values()}
        self.assertEqual(by_class["KSampler"]["cfg"], 5.5)

    def test_fast_runs_the_turbo_lora_at_its_own_eight_steps(self) -> None:
        fake = FakeComfy()

        operation = self.run_fill(fake, self.request(preset="fast"))

        self.assertEqual(operation.status, "succeeded", operation.error)
        prompt = fake.prompts[0]
        by_class = {node["class_type"]: node["inputs"] for node in prompt.values()}
        self.assertEqual(
            by_class["LoraLoaderModelOnly"]["lora_name"],
            "qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors",
        )
        titled = {node.get("_meta", {}).get("title"): node["inputs"] for node in prompt.values()}
        self.assertEqual(titled["DataForge Steps"]["value"], 8)
        self.assertEqual(by_class["KSampler"]["cfg"], 1.0)

    def test_a_second_fill_is_generated_on_top_of_the_first(self) -> None:
        first = solid_asset(
            make_fill(
                FillBox(left=0, top=0, width=400, height=300), digest=file_digest(self.media)
            ),
            color=(0, 255, 0, 255),
        )
        save_result(self.media, first)
        fake = FakeComfy()

        operation = self.run_fill(fake, self.request(fills=[first.fill.model_dump()]))

        assert operation.fill is not None
        self.assertEqual(operation.fill.parent_id, first.fill.id)
        # The crop the model saw already shows the first fill.
        self.assertEqual(fake.uploads[0].convert("RGB").getpixel((0, 0)), (0, 255, 0))


class RefusalTests(FillJobCase):
    def test_a_missing_parent_fill_is_refused_before_anything_is_queued(self) -> None:
        missing = make_fill(
            FillBox(left=0, top=0, width=40, height=30), digest=file_digest(self.media)
        )
        fake = FakeComfy()

        with self.assertRaises(FillUnavailableError):
            self.run_fill(fake, self.request(fills=[missing.model_dump()]))

        self.assertEqual(fake.calls, [])
        with image_fill_jobs._lock:
            self.assertEqual(image_fill_jobs._operations, {})

    def test_one_file_generates_one_fill_at_a_time(self) -> None:
        self.comfy_handler = FakeComfy(polls=10_000).handler

        start_fill(self.media, self.request())
        with self.assertRaises(FillInProgressError):
            start_fill(self.media, self.request())

    def test_an_empty_instruction_sends_the_default_removal(self) -> None:
        fake = FakeComfy()

        operation = self.run_fill(fake, self.request(instruction="  "))

        assert operation.fill is not None
        self.assertEqual(operation.fill.instruction, "")
        by_class = {node["class_type"]: node["inputs"] for node in fake.prompts[0].values()}
        self.assertIn(DEFAULT_FILL_INSTRUCTION, by_class["TextEncodeQwenImage21"]["prompt"])


class FailureTests(FillJobCase):
    def test_an_answer_of_the_wrong_size_fails_and_stores_nothing(self) -> None:
        fake = FakeComfy(output=lambda _source: Image.new("RGB", (17, 17)))

        operation = self.run_fill(fake)

        self.assertEqual(operation.status, "failed")
        self.assertIn("17 x 17", operation.error or "")
        self.assertIsNone(load_result(self.media, operation.id))

    def test_something_that_is_not_an_image_fails(self) -> None:
        fake = FakeComfy()
        original = fake.handler

        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/view":
                return httpx.Response(200, content=b"not a png")
            return original(request)

        operation = self.run_fill(fake, handler=handler)

        self.assertEqual(operation.status, "failed")
        self.assertIn("not an image", operation.error or "")

    def test_a_timeout_stops_the_prompt_and_fails(self) -> None:
        fake = FakeComfy(polls=10_000)

        with patch("image_fill_jobs.get_comfy_image_timeout", return_value=0.05):
            operation = self.run_fill(fake)

        self.assertEqual(operation.status, "failed")
        self.assertIn("did not finish", operation.error or "")
        self.assertEqual(fake.interrupted, [{"prompt_id": "p-1"}])

    def test_an_unreachable_comfyui_fails_with_that_reason(self) -> None:
        operation = self.run_fill(FakeComfy(), handler=refused)

        self.assertEqual(operation.status, "failed")
        self.assertIn("not reachable", operation.error or "")

    def test_an_execution_error_is_reported_from_history(self) -> None:
        fake = FakeComfy()
        original = fake.handler

        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/history/p-1":
                entry = {
                    "status": {
                        "status_str": "error",
                        "messages": [
                            [
                                "execution_error",
                                {"exception_message": "OOM", "node_type": "KSampler"},
                            ]
                        ],
                    }
                }
                return httpx.Response(200, json={"p-1": entry})
            return original(request)

        operation = self.run_fill(fake, handler=handler)

        self.assertEqual(operation.status, "failed")
        self.assertEqual(operation.error, "KSampler: OOM")


class CancelTests(FillJobCase):
    def _cancel_midway(self, fake: FakeComfy):
        self.comfy_handler = fake.handler
        operation = start_fill(self.media, self.request())
        deadline = time.monotonic() + 5
        while fake.history_reads == 0 and time.monotonic() < deadline:
            time.sleep(0.01)
        cancel_fill_operation(operation.id)
        return wait_until_finished(operation.id)

    def test_cancel_while_queued_drops_only_our_prompt(self) -> None:
        fake = FakeComfy(
            polls=10_000,
            queue=lambda: {
                "queue_running": [[0, "someone-else", {}]],
                "queue_pending": [[1, "p-1", {}]],
            },
        )

        operation = self._cancel_midway(fake)

        self.assertEqual(operation.status, "cancelled")
        self.assertEqual(fake.deleted, [{"delete": ["p-1"]}])
        self.assertEqual(fake.interrupted, [])

    def test_cancel_while_running_interrupts_our_prompt(self) -> None:
        fake = FakeComfy(polls=10_000)

        operation = self._cancel_midway(fake)

        self.assertEqual(operation.status, "cancelled")
        self.assertEqual(fake.interrupted, [{"prompt_id": "p-1"}])

    def test_cancel_never_touches_a_prompt_that_is_not_ours(self) -> None:
        fake = FakeComfy(
            polls=10_000,
            queue=lambda: {"queue_running": [[0, "someone-else", {}]], "queue_pending": []},
        )

        operation = self._cancel_midway(fake)

        self.assertEqual(operation.status, "cancelled")
        self.assertEqual((fake.interrupted, fake.deleted), ([], []))

    def test_cancel_while_waiting_for_the_gpu_queues_nothing(self) -> None:
        from external import comfy_execution

        fake = FakeComfy()
        self.comfy_handler = fake.handler
        comfy_execution._gpu_lock.acquire()
        try:
            operation = start_fill(self.media, self.request())
            self.assertEqual(get_fill_operation(operation.id).status, "waiting")
            cancel_fill_operation(operation.id)
            finished = wait_until_finished(operation.id)
        finally:
            comfy_execution._gpu_lock.release()

        self.assertEqual(finished.status, "cancelled")
        self.assertEqual(fake.prompts, [])


class StaleResultTests(FillJobCase):
    def test_a_result_made_before_an_external_replacement_cannot_be_applied(self) -> None:
        operation = self.run_fill(FakeComfy())
        assert operation.fill is not None
        image_edit.apply_image_edit(self.media, ImageEditSpec(rotate=180))
        Image.new("RGB", (400, 300), (200, 0, 0)).save(self.media)
        replacement = self.media.read_bytes()

        with self.assertRaisesRegex(FillUnavailableError, "original changed"):
            image_edit.apply_image_edit(self.media, ImageEditSpec(fills=[operation.fill]))

        # Adopted as the new original, and left exactly as the other program wrote it.
        self.assertEqual(self.media.read_bytes(), replacement)
        self.assertEqual(edit_sidecars.backup_path_for(self.media).read_bytes(), replacement)

    def test_the_source_is_not_held_while_the_model_runs(self) -> None:
        fake = FakeComfy(polls=10_000)
        self.comfy_handler = fake.handler
        start_fill(self.media, self.request())
        deadline = time.monotonic() + 5
        while fake.history_reads == 0 and time.monotonic() < deadline:
            time.sleep(0.01)

        # An edit from another request goes through while the fill waits on ComfyUI.
        done = threading.Event()

        def edit() -> None:
            image_edit.apply_image_edit(self.media, ImageEditSpec(rotate=90))
            done.set()

        threading.Thread(target=edit, daemon=True).start()
        self.assertTrue(done.wait(5))


if __name__ == "__main__":
    unittest.main()
