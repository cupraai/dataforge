import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx
from PIL import Image

import numbered_files
from automation.comfy_generate import run_comfy_generate_job, validate_comfy_generate_folder
from constants import STAGING_DIR_NAME
from testing_fixtures import COMFY_TEST_URL, write_media

#: The shape of a plain text-to-image export.
GENERATE_WORKFLOW = {
    "3": {
        "class_type": "KSampler",
        "inputs": {"seed": 7, "steps": 20, "model": ["4", 0], "positive": ["6", 0]},
    },
    "6": {
        "class_type": "CLIPTextEncode",
        "inputs": {"text": "a lighthouse at dusk", "clip": ["4", 1]},
        "_meta": {"title": "DataForge Prompt"},
    },
    "8": {
        "class_type": "PrimitiveInt",
        "inputs": {"value": 20},
        "_meta": {"title": "DataForge Steps"},
    },
    "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "out", "images": ["3", 0]}},
}

#: Like the shipped solid-color example.
PLAIN_WORKFLOW = {
    "1": {"class_type": "EmptyImage", "inputs": {"width": 8, "height": 8, "color": 0}},
    "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "out", "images": ["1", 0]}},
}

EDIT_WORKFLOW = {
    "1": {"class_type": "LoadImage", "inputs": {"image": "example.png"}},
    "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "out", "images": ["1", 0]}},
}

#: Loads a start image into a sampler, as image-to-video exports do.
SOURCE_WORKFLOW = {
    "1": {"class_type": "LoadImage", "inputs": {"image": "example.png"}},
    "3": {"class_type": "KSampler", "inputs": {"seed": 7, "steps": 20, "image": ["1", 0]}},
    "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "out", "images": ["3", 0]}},
}


def png_bytes(colour: str = "blue") -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (24, 24), colour).save(buffer, format="PNG")
    return buffer.getvalue()


class Workspace:
    def __init__(self) -> None:
        self._temp = tempfile.TemporaryDirectory()
        root = Path(self._temp.name)
        self.folder = root / "dataset"
        self.folder.mkdir()
        self.presets = root / "presets"
        self.presets.mkdir()
        for name, graph in (
            ("txt2img", GENERATE_WORKFLOW),
            ("plain", PLAIN_WORKFLOW),
            ("upscale", EDIT_WORKFLOW),
            ("i2v", SOURCE_WORKFLOW),
        ):
            (self.presets / f"{name}.json").write_text(json.dumps(graph), encoding="utf-8")
        self._previous = os.environ.get("COMFY_WORKFLOWS_DIR")
        os.environ["COMFY_WORKFLOWS_DIR"] = str(self.presets)

    def __enter__(self) -> "Workspace":
        return self

    def __exit__(self, *_exc: object) -> None:
        if self._previous is None:
            os.environ.pop("COMFY_WORKFLOWS_DIR", None)
        else:
            os.environ["COMFY_WORKFLOWS_DIR"] = self._previous
        self._temp.cleanup()

    def names(self) -> list[str]:
        return sorted(entry.name for entry in self.folder.iterdir())


def comfy_handler(
    *,
    files_per_run: int = 1,
    filename: str = "out.png",
    fail_on: set[str] | None = None,
    submitted: list[dict] | None = None,
    uploads: list[str] | None = None,
    image_optional: bool = True,
    output_node: str = "9",
):
    failing = fail_on or set()
    state = {"count": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path

        if path == "/upload/image":
            name = f"upload-{len(uploads or []) + 1}.png"
            if uploads is not None:
                uploads.append(name)
            return httpx.Response(200, json={"name": name, "subfolder": "dataforge"})

        if path == "/object_info/KSampler":
            group = "optional" if image_optional else "required"
            return httpx.Response(200, json={"KSampler": {"input": {group: {"image": ["IMAGE"]}}}})

        if path == "/prompt":
            state["count"] += 1
            if submitted is not None:
                submitted.append(json.loads(request.content)["prompt"])
            return httpx.Response(200, json={"prompt_id": f"p-{state['count']}", "node_errors": {}})

        if path.startswith("/history/"):
            prompt_id = path.rsplit("/", 1)[-1]
            if prompt_id in failing:
                error = {"node_type": "KSampler", "exception_message": "out of memory"}
                return httpx.Response(
                    200,
                    json={
                        prompt_id: {
                            "status": {
                                "status_str": "error",
                                "messages": [["execution_error", error]],
                            }
                        }
                    },
                )
            refs = [
                {"filename": f"{index}-{filename}", "subfolder": "", "type": "output"}
                for index in range(files_per_run)
            ]
            return httpx.Response(
                200,
                json={
                    prompt_id: {
                        "status": {"completed": True},
                        "outputs": {output_node: {"images": refs}},
                    }
                },
            )

        if path == "/view":
            return httpx.Response(200, content=png_bytes())

        return httpx.Response(200, json={})

    return handler


def run_with(handler, folder: Path, *, preset: str = "txt2img", **kwargs: object) -> dict:
    # Bound before the patch, or the factory would recurse.
    real_client = httpx.Client

    def make_client(
        *_args: object, base_url: str = COMFY_TEST_URL, **_kwargs: object
    ) -> httpx.Client:
        return real_client(base_url=base_url, transport=httpx.MockTransport(handler))

    with patch("external.comfy_client.httpx.Client", make_client):
        return run_comfy_generate_job(folder, preset=preset, **kwargs)


class ValidateTests(unittest.TestCase):
    def test_a_missing_folder_is_refused(self) -> None:
        with Workspace() as workspace, self.assertRaises(ValueError):
            validate_comfy_generate_folder(workspace.folder / "nope", preset="txt2img")

    def test_an_empty_folder_is_fine(self) -> None:
        with Workspace() as workspace:
            validate_comfy_generate_folder(workspace.folder, preset="txt2img")

    def test_the_staging_folder_is_refused(self) -> None:
        with Workspace() as workspace:
            staging = workspace.folder / STAGING_DIR_NAME
            staging.mkdir()

            with self.assertRaises(ValueError) as caught:
                validate_comfy_generate_folder(staging, preset="txt2img")

            self.assertIn("staging folder", str(caught.exception))

    def test_a_source_preset_generates_with_or_without_a_start_file(self) -> None:
        with Workspace() as workspace:
            start = write_media(workspace.folder, "start.png")
            validate_comfy_generate_folder(workspace.folder, preset="i2v")
            validate_comfy_generate_folder(workspace.folder, preset="i2v", start_path=str(start))

    def test_a_start_file_needs_a_preset_that_loads_one(self) -> None:
        with Workspace() as workspace:
            start = write_media(workspace.folder, "start.png")
            with self.assertRaises(ValueError) as caught:
                validate_comfy_generate_folder(
                    workspace.folder, preset="txt2img", start_path=str(start)
                )

            self.assertIn("takes no start file", str(caught.exception))

    def test_a_start_file_must_be_there_and_what_the_loader_takes(self) -> None:
        with Workspace() as workspace:
            clip = write_media(workspace.folder, "clip.mp4")
            for path, reason in (
                (workspace.folder / "gone.png", "no longer there"),
                (clip, "is not an image"),
            ):
                with self.subTest(reason=reason), self.assertRaises(ValueError) as caught:
                    validate_comfy_generate_folder(
                        workspace.folder, preset="i2v", start_path=str(path)
                    )
                self.assertIn(reason, str(caught.exception))

    def test_a_prompt_is_refused_when_the_preset_has_nowhere_to_put_it(self) -> None:
        with Workspace() as workspace:
            with self.assertRaises(ValueError) as caught:
                validate_comfy_generate_folder(
                    workspace.folder, preset="plain", prompt_text="a cat"
                )

            self.assertIn("DataForge Prompt", str(caught.exception))

    def test_a_prefix_that_is_not_a_plain_name_is_refused(self) -> None:
        with Workspace() as workspace:
            for prefix in ("sub/dir", "a:b", ".hidden", "trailing.", "x" * 81):
                with self.subTest(prefix=prefix), self.assertRaises(ValueError):
                    validate_comfy_generate_folder(
                        workspace.folder, preset="txt2img", name_prefix=prefix
                    )

    def test_a_custom_input_the_preset_lacks_is_refused(self) -> None:
        with Workspace() as workspace, self.assertRaises(ValueError):
            validate_comfy_generate_folder(
                workspace.folder, preset="txt2img", inputs={"Denoise": 0.5}
            )


class RunJobTests(unittest.TestCase):
    def test_each_run_writes_a_numbered_file_named_after_the_preset(self) -> None:
        with Workspace() as workspace:
            result = run_with(comfy_handler(), workspace.folder, count=3)

            self.assertEqual(
                workspace.names(), ["txt2img_0001.png", "txt2img_0002.png", "txt2img_0003.png"]
            )
            self.assertEqual(result["stats"]["success"], 3)
            self.assertEqual((result["total"], result["processed"]), (3, 3))
            with Image.open(workspace.folder / "txt2img_0001.png") as written:
                self.assertEqual(written.size, (24, 24))
            self.assertEqual(
                result["results"][0]["preview"], str(workspace.folder / "txt2img_0001.png")
            )

    def test_a_prefix_names_the_files_instead(self) -> None:
        with Workspace() as workspace:
            run_with(comfy_handler(), workspace.folder, count=1, name_prefix="  lighthouse  ")

            self.assertEqual(workspace.names(), ["lighthouse_0001.png"])

    def test_numbering_continues_past_every_file_the_prefix_used(self) -> None:
        """A leftover caption would pair with pixels it was never written for."""
        with Workspace() as workspace:
            (workspace.folder / "txt2img_0002.png").write_bytes(png_bytes("red"))
            (workspace.folder / "TXT2IMG_0005.txt").write_text("orphan", encoding="utf-8")
            (workspace.folder / "txt2img_extra.png").write_bytes(png_bytes("red"))

            run_with(comfy_handler(), workspace.folder, count=2)

            self.assertIn("txt2img_0006.png", workspace.names())
            self.assertIn("txt2img_0007.png", workspace.names())
            with Image.open(workspace.folder / "txt2img_0002.png") as kept:
                self.assertEqual(kept.getpixel((0, 0)), (255, 0, 0))

    def test_a_name_taken_meanwhile_is_skipped_never_replaced(self) -> None:
        with Workspace() as workspace:
            taken = workspace.folder / "txt2img_0001.png"
            taken.write_bytes(png_bytes("red"))
            temp = workspace.folder / "result.tmp"
            temp.write_bytes(png_bytes())

            # Another writer takes the name between the check and the publish.
            with patch.object(numbered_files, "name_is_free", return_value=True):
                published = numbered_files.publish_numbered(
                    temp, workspace.folder, "txt2img", ".png", 1, "generate"
                )

            self.assertEqual(published.name, "txt2img_0002.png")
            with Image.open(taken) as kept:
                self.assertEqual(kept.getpixel((0, 0)), (255, 0, 0))

    def test_every_file_of_a_batch_is_kept(self) -> None:
        with Workspace() as workspace:
            result = run_with(comfy_handler(files_per_run=2), workspace.folder, count=2)

            self.assertEqual(len(workspace.names()), 4)
            # A batch is one generation.
            self.assertEqual(result["stats"]["success"], 2)
            self.assertEqual(len(result["results"]), 4)

    def test_each_run_gets_its_own_random_seed_on_the_untitled_sampler(self) -> None:
        submitted: list[dict] = []
        with Workspace() as workspace:
            run_with(comfy_handler(submitted=submitted), workspace.folder, count=3)

        seeds = [prompt["3"]["inputs"]["seed"] for prompt in submitted]
        self.assertEqual(len(set(seeds)), 3)
        self.assertNotIn(7, seeds)

    def test_an_entered_seed_counts_up_so_a_run_can_be_repeated(self) -> None:
        submitted: list[dict] = []
        with Workspace() as workspace:
            result = run_with(
                comfy_handler(submitted=submitted), workspace.folder, count=3, seed=100
            )

        self.assertEqual([prompt["3"]["inputs"]["seed"] for prompt in submitted], [100, 101, 102])
        self.assertEqual(result["results"][1]["message"], "Seed 101")

    def test_the_prompt_and_inputs_reach_the_graph(self) -> None:
        submitted: list[dict] = []
        with Workspace() as workspace:
            run_with(
                comfy_handler(submitted=submitted),
                workspace.folder,
                count=1,
                prompt_text="  a harbour at noon  ",
                inputs={"Steps": 8},
            )

        self.assertEqual(submitted[0]["6"]["inputs"]["text"], "a harbour at noon")
        self.assertEqual(submitted[0]["8"]["inputs"]["value"], 8)

    def test_the_prompt_becomes_the_caption_only_when_asked(self) -> None:
        with Workspace() as workspace:
            run_with(comfy_handler(), workspace.folder, count=1, prompt_text="a harbour")
            self.assertNotIn("txt2img_0001.txt", workspace.names())

            run_with(
                comfy_handler(),
                workspace.folder,
                count=1,
                prompt_text="a harbour",
                caption_from_prompt=True,
            )
            caption = (workspace.folder / "txt2img_0002.txt").read_text(encoding="utf-8")
            self.assertEqual(caption.strip(), "a harbour")

    def test_an_empty_prompt_captions_with_the_text_the_preset_ran(self) -> None:
        with Workspace() as workspace:
            run_with(comfy_handler(), workspace.folder, count=1, caption_from_prompt=True)

            caption = (workspace.folder / "txt2img_0001.txt").read_text(encoding="utf-8")
            self.assertEqual(caption.strip(), "a lighthouse at dusk")

    def test_a_preset_without_a_sampler_runs_as_saved(self) -> None:
        submitted: list[dict] = []
        with Workspace() as workspace:
            result = run_with(
                comfy_handler(submitted=submitted),
                workspace.folder,
                preset="plain",
                count=2,
                caption_from_prompt=True,
            )

            self.assertEqual(workspace.names(), ["plain_0001.png", "plain_0002.png"])
            self.assertNotIn("message", result["results"][0])
        self.assertEqual(submitted[0]["1"], PLAIN_WORKFLOW["1"])

    def test_a_start_file_is_uploaded_once_and_every_run_is_seeded(self) -> None:
        submitted: list[dict] = []
        uploads: list[str] = []
        with Workspace() as workspace:
            start = write_media(workspace.folder, "start.png")
            result = run_with(
                comfy_handler(submitted=submitted, uploads=uploads),
                workspace.folder,
                preset="i2v",
                count=2,
                seed=5,
                start_path=str(start),
            )

            self.assertEqual(result["stats"]["success"], 2)
            self.assertEqual(workspace.names(), ["i2v_0001.png", "i2v_0002.png", "start.png"])

        self.assertEqual(len(uploads), 1)
        self.assertEqual(
            [p["1"]["inputs"]["image"] for p in submitted], ["dataforge/upload-1.png"] * 2
        )
        # An edit never seeds an untitled sampler; a generation must, or each run repeats.
        self.assertEqual([p["3"]["inputs"]["seed"] for p in submitted], [5, 6])

    def test_without_a_start_file_the_loader_is_left_out(self) -> None:
        submitted: list[dict] = []
        uploads: list[str] = []
        with Workspace() as workspace:
            result = run_with(
                comfy_handler(submitted=submitted, uploads=uploads), workspace.folder, preset="i2v"
            )

            self.assertEqual(result["stats"]["success"], 1)

        self.assertEqual(uploads, [])
        self.assertNotIn("1", submitted[0])
        self.assertNotIn("image", submitted[0]["3"]["inputs"])

    def test_a_preset_that_needs_its_start_file_fails_before_anything_runs(self) -> None:
        submitted: list[dict] = []
        with Workspace() as workspace:
            with self.assertRaises(ValueError) as caught:
                run_with(
                    comfy_handler(submitted=submitted, image_optional=False),
                    workspace.folder,
                    preset="i2v",
                )

        self.assertEqual(submitted, [])
        self.assertRegex(str(caught.exception), r'^No start image was chosen, .*"KSampler"')

    def test_a_failed_prompt_is_counted_without_stopping_the_run(self) -> None:
        with Workspace() as workspace:
            result = run_with(comfy_handler(fail_on={"p-1"}), workspace.folder, count=2)

            self.assertEqual(result["stats"]["comfy_error"], 1)
            self.assertEqual(result["stats"]["success"], 1)
            self.assertEqual(workspace.names(), ["txt2img_0001.png"])
            failed = result["results"][0]
            self.assertEqual((failed["name"], failed["status"]), ("Generation 1", "comfy_error"))
            self.assertIn("out of memory", failed["message"])

    def test_a_format_the_gallery_cannot_list_writes_nothing(self) -> None:
        with Workspace() as workspace:
            result = run_with(
                comfy_handler(files_per_run=2, filename="out.webp"), workspace.folder, count=1
            )

            self.assertEqual(result["stats"]["comfy_error"], 1)
            self.assertIn(".webp", result["results"][0]["message"])
            self.assertEqual(workspace.names(), [])

    def test_an_unreadable_image_is_refused_and_leaves_no_temp_file(self) -> None:
        def broken(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/view":
                return httpx.Response(200, content=b"not an image")
            return comfy_handler()(request)

        with Workspace() as workspace:
            result = run_with(broken, workspace.folder, count=1)

            self.assertEqual(result["stats"]["comfy_error"], 1)
            self.assertEqual(workspace.names(), [])

    def test_a_download_a_hard_kill_left_behind_is_cleared(self) -> None:
        with Workspace() as workspace:
            (workspace.folder / ".generate-abc123.tmp").write_bytes(b"partial")

            run_with(comfy_handler(), workspace.folder, count=1)

            self.assertEqual(workspace.names(), ["txt2img_0001.png"])

    def test_an_unreachable_comfy_reports_itself_per_run(self) -> None:
        def refusing(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("refused", request=request)

        with Workspace() as workspace:
            result = run_with(refusing, workspace.folder, count=2)

            self.assertEqual(result["stats"]["comfy_error"], 2)
            self.assertIn("not reachable", result["results"][0]["message"])

    def test_cancelling_before_the_first_run_sends_nothing(self) -> None:
        submitted: list[dict] = []
        with Workspace() as workspace:
            result = run_with(
                comfy_handler(submitted=submitted),
                workspace.folder,
                count=3,
                should_cancel=lambda: True,
            )

        self.assertEqual(result["stats"]["cancelled"], 3)
        self.assertEqual(result["processed"], 0)
        self.assertEqual(submitted, [])


def _embedded_graph() -> dict:
    graph = json.loads(json.dumps(GENERATE_WORKFLOW))
    del graph["6"]["_meta"]
    graph["4"] = {
        "class_type": "CheckpointLoaderSimple",
        "inputs": {"ckpt_name": "model.safetensors"},
    }
    graph["10"] = {"class_type": "LoadImage", "inputs": {"image": "example.png"}}
    graph["11"] = {
        "class_type": "SaveImage",
        "inputs": {"filename_prefix": "ref", "images": ["10", 0]},
    }
    return graph


class EmbeddedSourceTests(unittest.TestCase):
    def _render(self, workspace: Workspace) -> Path:
        return write_media(
            workspace.folder, "render_.png", text_chunks={"prompt": json.dumps(_embedded_graph())}
        )

    def test_a_files_own_workflow_runs_without_a_preset(self) -> None:
        submitted: list[dict] = []
        with Workspace() as workspace:
            render = self._render(workspace)
            result = run_with(
                comfy_handler(submitted=submitted),
                workspace.folder,
                preset="",
                prompt_text="a harbour at night",
                source={"path": str(render), "node_id": "9"},
            )

            self.assertEqual(result["stats"]["success"], 1)
            # Without the separator ComfyUI ended its name with.
            self.assertEqual(workspace.names(), ["render_.png", "render_0001.png"])

        self.assertEqual(submitted[0]["6"]["inputs"]["text"], "a harbour at night")
        self.assertNotIn("11", submitted[0])
        self.assertNotIn("10", submitted[0])

    def test_an_output_that_loads_a_file_generates_from_a_start_file(self) -> None:
        submitted: list[dict] = []
        with Workspace() as workspace:
            render = self._render(workspace)
            start = write_media(workspace.folder, "start.png")
            result = run_with(
                comfy_handler(submitted=submitted, uploads=[], output_node="11"),
                workspace.folder,
                preset="",
                source={"path": str(render), "node_id": "11"},
                start_path=str(start),
            )

            self.assertEqual(result["stats"]["success"], 1)

        self.assertEqual(submitted[0]["10"]["inputs"]["image"], "dataforge/upload-1.png")
        self.assertNotIn("3", submitted[0])

    def test_a_preset_and_a_file_together_are_refused(self) -> None:
        with Workspace() as workspace:
            render = self._render(workspace)
            with self.assertRaises(ValueError) as caught:
                validate_comfy_generate_folder(
                    workspace.folder,
                    preset="txt2img",
                    source={"path": str(render), "node_id": "9"},
                )

        self.assertIn("not both", str(caught.exception))

    def test_a_file_gone_before_the_run_is_refused(self) -> None:
        with Workspace() as workspace:
            with self.assertRaises(ValueError) as caught:
                validate_comfy_generate_folder(
                    workspace.folder,
                    source={"path": str(workspace.folder / "gone.png"), "node_id": "9"},
                )

        self.assertIn("no longer there", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
