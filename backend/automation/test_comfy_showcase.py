import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx

from automation.comfy_showcase import run_comfy_showcase_job
from automation.job_messages import comfy_showcase_error_message
from automation.showcase_plan import item_label, plan_showcase, showcase_grid
from automation.showcase_sheet import SheetGrid
from automation.test_comfy_generate import PLAIN_WORKFLOW, Workspace, png_bytes
from constants import MAX_SHEET_CELLS, MAX_SHOWCASE_GENERATIONS, STAGING_DIR_NAME
from schemas import ComfyShowcaseItem
from testing_fixtures import COMFY_TEST_URL, write_media

#: A diffusion model feeding one sampler, the shape AI-Toolkit's LoRAs are trained against.
SHOWCASE_WORKFLOW = {
    "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "base.safetensors"}},
    "3": {
        "class_type": "KSampler",
        "inputs": {"seed": 7, "model": ["1", 0], "positive": ["6", 0]},
    },
    "6": {
        "class_type": "CLIPTextEncode",
        "inputs": {"text": "a lighthouse at dusk", "clip": ["5", 0]},
        "_meta": {"title": "DataForge Prompt"},
    },
    "8": {
        "class_type": "PrimitiveInt",
        "inputs": {"value": 20},
        "_meta": {"title": "DataForge Steps"},
    },
    "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "out", "images": ["3", 0]}},
}

#: Starts from an image: a preset that edits files, a showcase all the same.
I2V_WORKFLOW = {
    "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "base.safetensors"}},
    "2": {"class_type": "LoadImage", "inputs": {"image": "example.png"}},
    "3": {
        "class_type": "KSampler",
        "inputs": {"noise_seed": 3, "model": ["1", 0], "image": ["2", 0]},
    },
    "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "out", "images": ["3", 0]}},
}

#: The model comes out of a node DataForge cannot place without asking ComfyUI.
PATCHED_MODEL_WORKFLOW = {
    "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "base.safetensors"}},
    "2": {
        "class_type": "ModelSamplingAuraFlow",
        "inputs": {"shift": 3.0, "model": ["1", 0]},
        "_meta": {"title": "DataForge Model"},
    },
    "3": {"class_type": "KSampler", "inputs": {"seed": 7, "model": ["2", 0]}},
    "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "out", "images": ["3", 0]}},
}

TWO_MODELS_WORKFLOW = {
    "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "high.safetensors"}},
    "2": {"class_type": "UNETLoader", "inputs": {"unet_name": "low.safetensors"}},
    "3": {"class_type": "KSampler", "inputs": {"seed": 7, "model": ["1", 0]}},
    "4": {"class_type": "KSampler", "inputs": {"seed": 7, "model": ["2", 0], "latent": ["3", 0]}},
    "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "out", "images": ["4", 0]}},
}

SUBJECT = "LORAS\\subject_000001000.safetensors"
LATER = "LORAS\\subject_000001500.safetensors"
EXTRA = "style.safetensors"
KNOWN_LORAS = [SUBJECT, LATER, EXTRA]


class ShowcaseWorkspace(Workspace):
    def __init__(self) -> None:
        super().__init__()
        for name, graph in (
            ("showcase", SHOWCASE_WORKFLOW),
            ("i2v", I2V_WORKFLOW),
            ("patched", PATCHED_MODEL_WORKFLOW),
            ("two-models", TWO_MODELS_WORKFLOW),
            ("plain", PLAIN_WORKFLOW),
        ):
            (self.presets / f"{name}.json").write_text(json.dumps(graph), encoding="utf-8")

    def __enter__(self) -> "ShowcaseWorkspace":
        return self


def showcase_handler(
    *,
    submitted: list[dict] | None = None,
    uploads: list[str] | None = None,
    fail_on: set[str] | None = None,
    loras: list[str] | None = None,
    model_outputs: list[str] | None = None,
    image_optional: bool = True,
):
    failing = fail_on or set()
    state = {"count": 0}
    names = KNOWN_LORAS if loras is None else loras

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/object_info/LoraLoaderModelOnly":
            spec = {"input": {"required": {"lora_name": [names, {}]}}}
            return httpx.Response(200, json={"LoraLoaderModelOnly": spec})
        if path == "/object_info/KSampler":
            group = "optional" if image_optional else "required"
            return httpx.Response(200, json={"KSampler": {"input": {group: {"image": ["IMAGE"]}}}})
        if path == "/object_info/ModelSamplingAuraFlow":
            spec = {"output": model_outputs or ["MODEL"]}
            return httpx.Response(200, json={"ModelSamplingAuraFlow": spec})
        if path == "/upload/image":
            name = f"upload-{len(uploads or []) + 1}.png"
            if uploads is not None:
                uploads.append(name)
            return httpx.Response(200, json={"name": name, "subfolder": "dataforge"})
        if path == "/prompt":
            state["count"] += 1
            if submitted is not None:
                submitted.append(json.loads(request.content)["prompt"])
            return httpx.Response(200, json={"prompt_id": f"p-{state['count']}", "node_errors": {}})
        if path.startswith("/history/"):
            prompt_id = path.rsplit("/", 1)[-1]
            if prompt_id in failing:
                error = {"node_type": "KSampler", "exception_message": "out of memory"}
                status = {"status_str": "error", "messages": [["execution_error", error]]}
                return httpx.Response(200, json={prompt_id: {"status": status}})
            refs = [{"filename": "out.png", "subfolder": "", "type": "output"}]
            outputs = {"9": {"images": refs}}
            return httpx.Response(
                200, json={prompt_id: {"status": {"completed": True}, "outputs": outputs}}
            )
        if path == "/view":
            return httpx.Response(200, content=png_bytes())
        return httpx.Response(200, json={})

    return handler


def run_with(handler, folder: Path, **params: object) -> dict:
    real_client = httpx.Client

    def make_client(
        *_args: object, base_url: str = COMFY_TEST_URL, **_kwargs: object
    ) -> httpx.Client:
        return real_client(base_url=base_url, transport=httpx.MockTransport(handler))

    with patch("external.comfy_client.httpx.Client", make_client):
        return run_comfy_showcase_job(folder, **params)


def item(prompt: str = "", **fields: object) -> dict[str, object]:
    return {"prompt_text": prompt, **fields}


def lora_chain(prompt: dict, sampler: str = "3") -> list[tuple[str, float]]:
    """The LoRAs feeding ``sampler``'s model, nearest the base model first."""
    chain: list[tuple[str, float]] = []
    link = prompt[sampler]["inputs"]["model"]
    while prompt[link[0]]["class_type"] == "LoraLoaderModelOnly":
        inputs = prompt[link[0]]["inputs"]
        chain.append((inputs["lora_name"], inputs["strength_model"]))
        link = inputs["model"]
    return list(reversed(chain))


def sampler_seed(prompt: dict, key: str = "seed", sampler: str = "3") -> int:
    return prompt[sampler]["inputs"][key]


class ItemLabelTests(unittest.TestCase):
    def test_the_label_wins_then_the_prompt_then_the_position(self) -> None:
        self.assertEqual(
            item_label(ComfyShowcaseItem(label=" Beach ", prompt_text="x"), 2), "Beach"
        )
        self.assertEqual(item_label(ComfyShowcaseItem(prompt_text="\n  a cat\nmore"), 2), "a cat")
        self.assertEqual(item_label(ComfyShowcaseItem(), 3), "Item 3")

    def test_a_long_first_line_is_cut(self) -> None:
        label = item_label(ComfyShowcaseItem(prompt_text="word " * 30), 1)
        self.assertLessEqual(len(label), 40)
        self.assertTrue(label.endswith("…"))


class ValidateTests(unittest.TestCase):
    def check(self, workspace: Workspace, message: str, **params: object) -> None:
        defaults: dict[str, object] = {
            "preset": "showcase",
            "subject_loras": [SUBJECT],
            "items": [item("a")],
        }
        with self.assertRaises(ValueError) as caught:
            plan_showcase(workspace.folder, **{**defaults, **params})
        self.assertIn(message, str(caught.exception))

    def test_a_showcase_needs_the_lora_it_shows(self) -> None:
        with ShowcaseWorkspace() as workspace:
            self.check(workspace, "Choose the LoRA to showcase", subject_loras=[])
            self.check(workspace, "Choose the LoRA to showcase", subject_loras=[" "])
            self.check(workspace, "compared once", subject_loras=[SUBJECT, SUBJECT])

    def test_at_least_one_item_must_be_on(self) -> None:
        with ShowcaseWorkspace() as workspace:
            self.check(workspace, "at least one item", items=[])
            self.check(workspace, "at least one item", items=[item("a", enabled=False)])

    def test_a_preset_without_a_model_to_patch_is_refused(self) -> None:
        with ShowcaseWorkspace() as workspace:
            self.check(workspace, "DataForge Model", preset="plain")
            self.check(workspace, "loads 2 models", preset="two-models")

    def test_errors_name_the_item_by_its_place_in_the_list(self) -> None:
        with ShowcaseWorkspace() as workspace:
            items = [item("ok", enabled=False), item("ok"), item("ok", inputs={"Steps": "x"})]
            self.check(workspace, "Item 3", items=items)

    def test_a_prompt_needs_a_prompt_node(self) -> None:
        with ShowcaseWorkspace() as workspace:
            self.check(workspace, "has a prompt", preset="patched")

    def test_start_files_follow_the_preset(self) -> None:
        with ShowcaseWorkspace() as workspace:
            image = write_media(workspace.folder, "start.png")
            clip = workspace.folder / "start.mp4"
            clip.write_bytes(b"not read")
            self.check(workspace, "loads none", items=[item("a", source_path=str(image))])
            self.check(
                workspace,
                "no longer there",
                preset="i2v",
                items=[item(source_path=str(workspace.folder / "gone.png"))],
            )
            self.check(
                workspace, "is not an image", preset="i2v", items=[item(source_path=str(clip))]
            )

    def test_an_item_cannot_load_a_lora_twice(self) -> None:
        with ShowcaseWorkspace() as workspace:
            twice = [{"name": EXTRA}, {"name": EXTRA}]
            self.check(workspace, "one LoRA twice", items=[item("a", loras=twice)])
            showcased = [{"name": SUBJECT}]
            self.check(workspace, "being showcased", items=[item("a", loras=showcased)])
            self.check(workspace, "no LoRA chosen", items=[item("a", loras=[{"name": " "}])])

    def test_a_turned_off_extra_lora_is_not_checked(self) -> None:
        with ShowcaseWorkspace() as workspace:
            plan = plan_showcase(
                workspace.folder,
                preset="showcase",
                subject_loras=[SUBJECT],
                items=[item("a", loras=[{"name": SUBJECT, "enabled": False}])],
            )
            self.assertEqual(plan.entries[0].extras, ())

    def test_too_many_generations_are_refused(self) -> None:
        with ShowcaseWorkspace() as workspace:
            items = [item(f"item {n}") for n in range(MAX_SHOWCASE_GENERATIONS // 8 + 1)]
            loras = [f"lora_{n}.safetensors" for n in range(8)]
            self.check(
                workspace,
                f"would run {len(items) * 8} generations",
                subject_loras=loras,
                items=items,
            )

    def test_a_sheet_too_large_is_refused_before_anything_renders(self) -> None:
        with ShowcaseWorkspace() as workspace:
            items = [item(f"item {n}") for n in range(MAX_SHEET_CELLS // 2 + 1)]
            loras = [SUBJECT, LATER]
            self.check(
                workspace,
                f"holds at most {MAX_SHEET_CELLS} results",
                subject_loras=loras,
                items=items,
                make_sheet=True,
            )
            plan = plan_showcase(
                workspace.folder, preset="showcase", subject_loras=loras, items=items
            )
            self.assertFalse(plan.make_sheet)

    def test_a_staging_folder_is_refused(self) -> None:
        with ShowcaseWorkspace() as workspace:
            staging = workspace.folder / STAGING_DIR_NAME
            staging.mkdir()
            with self.assertRaises(ValueError):
                plan_showcase(
                    staging, preset="showcase", subject_loras=[SUBJECT], items=[item("a")]
                )

    def test_the_prefix_defaults_to_the_preset(self) -> None:
        with ShowcaseWorkspace() as workspace:
            plan = plan_showcase(
                workspace.folder, preset="showcase", subject_loras=[SUBJECT], items=[item("a")]
            )
            self.assertEqual(plan.prefix, "showcase")


class SheetGridTests(unittest.TestCase):
    def grid(self, subjects: list[str], items: list[dict], missing: set = frozenset()) -> SheetGrid:
        with ShowcaseWorkspace() as workspace:
            plan = plan_showcase(
                workspace.folder, preset="showcase", subject_loras=subjects, items=items
            )
        made = {
            (entry.number, subject): Path(f"{entry.number}-{subject}")
            for entry in plan.entries
            for subject in subjects
            if (entry.number, subject) not in missing
        }
        return showcase_grid(plan, made)

    def test_saves_of_one_run_are_plotted_in_training_order(self) -> None:
        final = "LORAS\\subject.safetensors"
        grid = self.grid([final, LATER, SUBJECT], [item("a"), item("b")])

        self.assertEqual(grid.column_labels, ("step 1000", "step 1500", "final"))
        self.assertEqual(grid.row_labels, ("a", "b"))
        self.assertEqual(
            [(str(cell.path), cell.row, cell.column) for cell in grid.cells[:3]],
            [(f"1-{SUBJECT}", 0, 0), (f"1-{LATER}", 0, 1), (f"1-{final}", 0, 2)],
        )

    def test_unrelated_loras_keep_their_order_and_names(self) -> None:
        grid = self.grid([SUBJECT, EXTRA], [item("a")])

        self.assertEqual(grid.column_labels, ("subject_000001000", "style"))

    def test_a_failed_result_leaves_its_place_blank_and_a_failed_item_its_row_out(self) -> None:
        grid = self.grid(
            [SUBJECT, LATER],
            [item("a"), item("b"), item("c")],
            missing={(1, LATER), (2, SUBJECT), (2, LATER)},
        )

        self.assertEqual(grid.row_labels, ("a", "c"))
        self.assertEqual([(cell.row, cell.column) for cell in grid.cells], [(0, 0), (1, 0), (1, 1)])

    def test_one_lora_fills_a_square_labelled_by_item(self) -> None:
        grid = self.grid([SUBJECT], [item(name) for name in "abcde"])

        self.assertEqual((grid.row_labels, grid.column_labels), ((), ()))
        self.assertEqual(
            [(cell.row, cell.column, cell.label) for cell in grid.cells],
            [(0, 0, "a"), (0, 1, "b"), (0, 2, "c"), (1, 0, "d"), (1, 1, "e")],
        )

    def test_prompts_that_open_alike_are_told_apart_by_number(self) -> None:
        items = [item("shot\none"), item("off", enabled=False), item("shot\ntwo")]
        labelled = item("shot\nthree", label="Beach")
        grid = self.grid([SUBJECT, LATER], [*items, labelled])

        self.assertEqual(grid.row_labels, ("Item 1", "Item 3", "Beach"))


class RunTests(unittest.TestCase):
    def sheet_run(self, workspace: Workspace, **handler: object) -> dict:
        return run_with(
            showcase_handler(**handler),
            workspace.folder,
            preset="showcase",
            subject_loras=[SUBJECT, LATER],
            items=[item("a"), item("b")],
            make_sheet=True,
        )

    def test_the_sheet_is_made_from_the_results_and_listed_first(self) -> None:
        with ShowcaseWorkspace() as workspace:
            result = self.sheet_run(workspace)

            first = result["results"][0]
            self.assertEqual(first["name"], "showcase_sheet_0001.png")
            self.assertEqual(first["preview"], first["path"])
            # The sheet is not a generation.
            self.assertEqual(result["stats"], {"total": 4, "success": 4})
            self.assertEqual(len(workspace.names()), 5)

            again = self.sheet_run(workspace)
            self.assertEqual(again["results"][0]["name"], "showcase_sheet_0002.png")
            self.assertIn("showcase_0008.png", workspace.names())

    def test_a_failed_generation_still_gets_a_sheet_of_the_rest(self) -> None:
        with ShowcaseWorkspace() as workspace:
            result = self.sheet_run(workspace, fail_on={"p-2"})

            self.assertEqual(result["results"][0]["name"], "showcase_sheet_0001.png")
            self.assertEqual(result["stats"], {"total": 4, "success": 3, "comfy_error": 1})

    def test_no_sheet_is_made_when_nothing_rendered_or_the_job_was_cancelled(self) -> None:
        with ShowcaseWorkspace() as workspace:
            self.sheet_run(workspace, fail_on={"p-1", "p-2", "p-3", "p-4"})
            self.assertEqual(workspace.names(), [])

        with ShowcaseWorkspace() as workspace:
            submitted: list[dict] = []
            run_with(
                showcase_handler(submitted=submitted),
                workspace.folder,
                preset="showcase",
                subject_loras=[SUBJECT, LATER],
                items=[item("a"), item("b")],
                make_sheet=True,
                should_cancel=lambda: len(submitted) >= 1,
            )
            self.assertEqual(workspace.names(), ["showcase_0001.png"])

    def test_a_sheet_that_fails_keeps_every_result(self) -> None:
        with (
            ShowcaseWorkspace() as workspace,
            patch(
                "automation.comfy_showcase.make_showcase_sheet", side_effect=OSError("disk full")
            ),
        ):
            result = self.sheet_run(workspace)

            self.assertEqual(result["stats"], {"total": 4, "success": 4, "sheet_error": 1})
            self.assertEqual(result["processed"], 4)
            self.assertEqual(result["results"][-1]["message"], "disk full")
            self.assertEqual(
                comfy_showcase_error_message(result["stats"]),
                "The showcase sheet could not be made.",
            )
            self.assertEqual(len(workspace.names()), 4)

    def test_items_run_in_order_once_per_lora_with_one_seed(self) -> None:
        with ShowcaseWorkspace() as workspace:
            submitted: list[dict] = []
            result = run_with(
                showcase_handler(submitted=submitted),
                workspace.folder,
                preset="showcase",
                subject_loras=[SUBJECT, LATER],
                items=[
                    item("first", seed=10, subject_strength=0.8),
                    item("second", seed=20, loras=[{"name": EXTRA, "strength": 0.5}]),
                ],
            )

            chains = [lora_chain(prompt) for prompt in submitted]
            self.assertEqual(
                chains,
                [
                    [(SUBJECT, 0.8)],
                    [(LATER, 0.8)],
                    [(SUBJECT, 1.0), (EXTRA, 0.5)],
                    [(LATER, 1.0), (EXTRA, 0.5)],
                ],
            )
            self.assertEqual([sampler_seed(p) for p in submitted], [10, 10, 20, 20])
            self.assertEqual(
                [p["6"]["inputs"]["text"] for p in submitted],
                ["first", "first", "second", "second"],
            )
            self.assertEqual(result["stats"]["success"], 4)
            self.assertEqual(result["total"], 4)
            self.assertEqual(len(workspace.names()), 4)

            self.assertEqual(result["results"][0]["preview"], result["results"][0]["path"])
            self.assertIn("subject_000001000 · Seed 10", result["results"][0]["message"])

    def test_a_random_seed_is_drawn_once_per_item(self) -> None:
        with ShowcaseWorkspace() as workspace:
            submitted: list[dict] = []
            with patch("automation.comfy_showcase.secrets.randbelow", side_effect=[100, 200]):
                run_with(
                    showcase_handler(submitted=submitted),
                    workspace.folder,
                    preset="showcase",
                    subject_loras=[SUBJECT, LATER],
                    items=[item("a"), item("b")],
                )

            self.assertEqual([sampler_seed(p) for p in submitted], [100, 100, 200, 200])

    def test_a_source_preset_uploads_each_start_once_and_seeds_its_samplers(self) -> None:
        with ShowcaseWorkspace() as workspace:
            start = write_media(workspace.folder, "start.png")
            submitted: list[dict] = []
            uploads: list[str] = []
            run_with(
                showcase_handler(submitted=submitted, uploads=uploads),
                workspace.folder,
                preset="i2v",
                subject_loras=[SUBJECT, LATER],
                items=[item(source_path=str(start), seed=5)],
            )

            self.assertEqual(len(uploads), 1)
            self.assertEqual(
                [p["2"]["inputs"]["image"] for p in submitted], ["dataforge/upload-1.png"] * 2
            )
            self.assertEqual([sampler_seed(p, "noise_seed") for p in submitted], [5, 5])

    def test_items_sharing_a_start_upload_it_once(self) -> None:
        with ShowcaseWorkspace() as workspace:
            start = write_media(workspace.folder, "start.png")
            uploads: list[str] = []
            result = run_with(
                showcase_handler(uploads=uploads),
                workspace.folder,
                preset="i2v",
                subject_loras=[SUBJECT],
                items=[item(source_path=str(start)), item(source_path=str(start))],
            )

            self.assertEqual(result["stats"]["success"], 2)
            self.assertEqual(len(uploads), 1)

    def test_an_item_without_a_start_runs_without_the_loader(self) -> None:
        with ShowcaseWorkspace() as workspace:
            start = write_media(workspace.folder, "start.png")
            submitted: list[dict] = []
            uploads: list[str] = []
            result = run_with(
                showcase_handler(submitted=submitted, uploads=uploads),
                workspace.folder,
                preset="i2v",
                subject_loras=[SUBJECT],
                items=[item(seed=5), item(source_path=str(start), seed=6)],
            )

            self.assertEqual(result["stats"]["success"], 2)
            self.assertEqual(len(uploads), 1)
            bare, loaded = submitted
            self.assertNotIn("2", bare)
            self.assertNotIn("image", bare["3"]["inputs"])
            self.assertEqual(lora_chain(bare), [(SUBJECT, 1.0)])
            self.assertEqual(loaded["3"]["inputs"]["image"], ["2", 0])

    def test_a_preset_that_requires_its_start_fails_before_anything_runs(self) -> None:
        with ShowcaseWorkspace() as workspace:
            start = write_media(workspace.folder, "start.png")
            submitted: list[dict] = []
            handler = showcase_handler(submitted=submitted, image_optional=False)
            with self.assertRaises(ValueError) as caught:
                run_with(
                    handler,
                    workspace.folder,
                    preset="i2v",
                    subject_loras=[SUBJECT],
                    items=[item(source_path=str(start)), item()],
                )

            self.assertEqual(submitted, [])
            self.assertRegex(
                str(caught.exception), r'^Item 2 has no start image, .*"KSampler" \(KSampler\)'
            )

            # With every start given, whether it is required does not matter.
            run_with(
                handler,
                workspace.folder,
                preset="i2v",
                subject_loras=[SUBJECT],
                items=[item(source_path=str(start))],
            )
            self.assertEqual(len(submitted), 1)

    def test_turned_off_items_are_skipped_but_keep_their_number(self) -> None:
        with ShowcaseWorkspace() as workspace:
            result = run_with(
                showcase_handler(),
                workspace.folder,
                preset="showcase",
                subject_loras=[SUBJECT],
                items=[item("a", enabled=False), item("b")],
            )

            [row] = result["results"]
            self.assertIn("b · subject_000001000", row["message"])

    def test_a_failed_run_is_named_by_item_and_lora(self) -> None:
        with ShowcaseWorkspace() as workspace:
            result = run_with(
                showcase_handler(fail_on={"p-2"}),
                workspace.folder,
                preset="showcase",
                subject_loras=[SUBJECT, LATER],
                items=[item("a")],
            )

            failed = [row for row in result["results"] if row["status"] == "comfy_error"]
            self.assertEqual(len(failed), 1)
            self.assertEqual(failed[0]["name"], "Item 1 with subject_000001500")
            self.assertEqual(result["stats"], {"total": 2, "success": 1, "comfy_error": 1})

    def test_a_lora_comfyui_lacks_fails_before_anything_runs(self) -> None:
        with ShowcaseWorkspace() as workspace:
            submitted: list[dict] = []
            with self.assertRaises(ValueError) as caught:
                run_with(
                    showcase_handler(submitted=submitted, loras=[SUBJECT]),
                    workspace.folder,
                    preset="showcase",
                    subject_loras=[SUBJECT],
                    items=[item("a", loras=[{"name": EXTRA}])],
                )

            self.assertIn(EXTRA, str(caught.exception))
            self.assertEqual(submitted, [])

    def test_a_titled_model_node_is_placed_through_comfyui(self) -> None:
        with ShowcaseWorkspace() as workspace:
            submitted: list[dict] = []
            run_with(
                showcase_handler(submitted=submitted),
                workspace.folder,
                preset="patched",
                subject_loras=[SUBJECT],
                items=[item()],
            )

            self.assertEqual(lora_chain(submitted[0]), [(SUBJECT, 1.0)])
            first = submitted[0][submitted[0]["3"]["inputs"]["model"][0]]
            self.assertEqual(first["inputs"]["model"], ["2", 0])

    def test_a_titled_node_without_a_model_output_fails_the_job(self) -> None:
        with ShowcaseWorkspace() as workspace, self.assertRaises(ValueError) as caught:
            run_with(
                showcase_handler(model_outputs=["LATENT"]),
                workspace.folder,
                preset="patched",
                subject_loras=[SUBJECT],
                items=[item()],
            )
        self.assertIn("no model output", str(caught.exception))

    def test_cancelling_counts_what_did_not_run(self) -> None:
        with ShowcaseWorkspace() as workspace:
            submitted: list[dict] = []
            result = run_with(
                showcase_handler(submitted=submitted),
                workspace.folder,
                preset="showcase",
                subject_loras=[SUBJECT, LATER],
                items=[item("a"), item("b")],
                should_cancel=lambda: len(submitted) >= 1,
            )

            self.assertEqual(len(submitted), 1)
            self.assertEqual(result["stats"]["cancelled"], 3)
            self.assertEqual(result["processed"], 1)

    def test_captions_follow_each_item(self) -> None:
        with ShowcaseWorkspace() as workspace:
            run_with(
                showcase_handler(),
                workspace.folder,
                preset="showcase",
                subject_loras=[SUBJECT],
                caption_from_prompt=True,
                items=[item("first"), item("")],
            )

            captions = sorted(workspace.folder.glob("*.txt"))
            self.assertEqual(
                [path.read_text(encoding="utf-8").strip() for path in captions],
                ["first", "a lighthouse at dusk"],
            )


if __name__ == "__main__":
    unittest.main()
