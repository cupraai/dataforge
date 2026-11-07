from __future__ import annotations

from testing_fixtures import isolate_test_database

isolate_test_database()

import unittest
from pathlib import Path
from typing import ClassVar
from unittest.mock import patch

import httpx

from comfy_settings import FILL_TEMPLATES_DIR, FillSettings
from external.comfy_workflows import (
    ComfyWorkflowError,
    build_comfy_prompt,
    list_comfy_presets,
    parse_comfy_workflow,
)
from image_fill_workflow import (
    DEFAULT_FILL_INSTRUCTION,
    FILL_TEMPLATES,
    build_fill_prompt,
    describe_fill_presets,
    fill_prompt_text,
    load_fill_template,
)
from testing_fixtures import forget_saved_settings, mock_comfy_client

SETTINGS = FillSettings(
    diffusion_model="qwen_image_2.1_bf16.safetensors",
    text_encoder="qwen3vl_8b_bf16.safetensors",
    vae="texture_fix_vae_for_qwen_image_2.1_bf16.safetensors",
    turbo_lora="QW21\\turbo.safetensors",
    quality_steps=36,
    quality_cfg=4.5,
)

#: Each loader's file-name input, keyed by the setting that names it.
_LOADER_INPUTS = {
    "UNETLoader": "unet_name",
    "CLIPLoader": "clip_name",
    "VAELoader": "vae_name",
    "LoraLoaderModelOnly": "lora_name",
}


def _template_classes() -> set[str]:
    classes: set[str] = set()
    for preset in FILL_TEMPLATES:
        prompt = load_fill_template(preset).workflow.prompt
        classes |= {node["class_type"] for node in prompt.values()}
    return classes


def object_info(
    *, missing: frozenset[str] = frozenset(), models: dict[str, list[str]] | None = None
):
    """A ComfyUI that knows every template node except ``missing``, offering ``models``."""
    models = models or {}

    def handler(request: httpx.Request) -> httpx.Response:
        class_type = request.url.path.removeprefix("/object_info/")
        if class_type in missing or class_type not in _template_classes():
            return httpx.Response(200, json={})
        info: dict = {"input": {"required": {}}}
        key = _LOADER_INPUTS.get(class_type)
        if key is not None:
            info["input"]["required"][key] = [models.get(class_type, []), {}]
        return httpx.Response(200, json={class_type: info})

    return handler


DEFAULT_MODELS = {
    "UNETLoader": ["qwen_image_2.1_int8_convrot.safetensors"],
    "CLIPLoader": ["qwen3vl_8b_int8_convrot.safetensors"],
    "VAELoader": ["qwen_image_2.1_vae_bf16.safetensors"],
    "LoraLoaderModelOnly": ["qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors"],
}


class TemplateTests(unittest.TestCase):
    def test_the_selection_guides_the_reference_and_the_native_sampler(self) -> None:
        for preset in FILL_TEMPLATES:
            with self.subTest(preset=preset):
                graph = load_fill_template(preset).workflow.prompt
                nodes = {node["class_type"]: node["inputs"] for node in graph.values()}
                self.assertIn("KSampler", nodes)
                self.assertFalse(any(name.startswith("LanPaint_") for name in nodes))
                sampler = nodes["KSampler"]
                self.assertEqual(sampler["cfg"], {"fast": 1.0, "quality": 3.0}[preset])

                conditioning = graph[sampler["positive"][0]]["inputs"]
                reference = graph[conditioning["images.image_1"][0]]
                self.assertEqual(reference["class_type"], "ImageCompositeMasked")
                reference_inputs = reference["inputs"]
                marker = graph[reference_inputs["source"][0]]
                self.assertEqual(marker["class_type"], "EmptyImage")
                self.assertEqual(marker["inputs"]["color"], 0xFF00FF)
                self.assertTrue(reference_inputs["resize_source"])

                latent = graph[sampler["latent_image"][0]]
                self.assertEqual(latent["class_type"], "SetLatentNoiseMask")
                self.assertEqual(latent["inputs"]["mask"], reference_inputs["mask"])
                encoded = graph[latent["inputs"]["samples"][0]]
                self.assertEqual(encoded["class_type"], "VAEEncode")
                self.assertEqual(encoded["inputs"]["pixels"], reference_inputs["destination"])
                sampler_id = next(
                    key for key, node in graph.items() if node["class_type"] == "KSampler"
                )
                self.assertEqual(nodes["VAEDecode"]["samples"], [sampler_id, 0])
                self.assertEqual(graph[nodes["SaveImage"]["images"][0]]["class_type"], "VAEDecode")

    def test_both_templates_ship_and_resolve_every_role(self) -> None:
        for preset in FILL_TEMPLATES:
            template = load_fill_template(preset)
            workflow = template.workflow
            self.assertEqual(workflow.prompt[workflow.input_node]["class_type"], "LoadImage")
            self.assertEqual(workflow.prompt[workflow.mask_node]["class_type"], "LoadImageMask")
            names = {entry.name for entry in workflow.custom_inputs}
            self.assertEqual(names, {"Steps"})
            self.assertRegex(template.identity, r"^qwen21_fill_\w+@[0-9a-f]{12}$")

    def test_the_templates_are_not_listed_as_prep_presets(self) -> None:
        names = {preset.name for preset in list_comfy_presets()}
        self.assertFalse(names & set(FILL_TEMPLATES.values()))
        self.assertTrue((FILL_TEMPLATES_DIR / "qwen21_fill_fast.json").is_file())

    def test_models_steps_and_cfg_come_from_settings(self) -> None:
        quality = build_fill_prompt(
            load_fill_template("quality"),
            image_ref="dataforge/i.png",
            mask_ref="dataforge/m.png",
            prompt_text="text",
            seed=3,
            filename_prefix="DataForge/fill/x",
            settings=SETTINGS,
        )
        fast = build_fill_prompt(
            load_fill_template("fast"),
            image_ref="dataforge/i.png",
            mask_ref="dataforge/m.png",
            prompt_text="text",
            seed=3,
            filename_prefix="DataForge/fill/x",
            settings=SETTINGS,
        )

        def titled(prompt: dict, title: str) -> dict:
            return next(
                n["inputs"] for n in prompt.values() if n.get("_meta", {}).get("title") == title
            )

        def by_class(prompt: dict, class_type: str) -> dict:
            return next(n["inputs"] for n in prompt.values() if n["class_type"] == class_type)

        self.assertEqual(by_class(quality, "UNETLoader")["unet_name"], SETTINGS.diffusion_model)
        self.assertEqual(by_class(quality, "CLIPLoader")["clip_name"], SETTINGS.text_encoder)
        self.assertEqual(by_class(quality, "VAELoader")["vae_name"], SETTINGS.vae)
        self.assertEqual(by_class(fast, "LoraLoaderModelOnly")["lora_name"], SETTINGS.turbo_lora)
        self.assertEqual(titled(quality, "DataForge Steps")["value"], 36)
        self.assertEqual(titled(fast, "DataForge Steps")["value"], 8)
        self.assertEqual(titled(quality, "DataForge Mask")["image"], "dataforge/m.png")
        self.assertEqual(titled(quality, "DataForge Output")["filename_prefix"], "DataForge/fill/x")
        self.assertEqual(by_class(quality, "KSampler")["cfg"], 4.5)
        self.assertEqual(by_class(fast, "KSampler")["cfg"], 1.0)
        self.assertEqual(by_class(fast, "TextEncodeQwenImage21")["negative_prompt"], "")

    def test_an_empty_instruction_removes_and_words_say_what_goes_there(self) -> None:
        self.assertIn(DEFAULT_FILL_INSTRUCTION, fill_prompt_text("  "))
        self.assertNotIn(DEFAULT_FILL_INSTRUCTION, fill_prompt_text("a red vase."))
        for instruction in ("", "a smooth wall"):
            with self.subTest(instruction=instruction):
                prompt = fill_prompt_text(instruction)
                self.assertIn("<image1>", prompt)
                self.assertIn("solid magenta selection", prompt)
                self.assertIn(instruction or DEFAULT_FILL_INSTRUCTION, prompt)
                self.assertIn("outside it unchanged", prompt)
                self.assertNotIn("..", prompt)


class PresetStateTests(unittest.TestCase):
    def setUp(self) -> None:
        forget_saved_settings()

    def describe(self, handler) -> dict:
        with mock_comfy_client(handler) as client:
            return {state.preset: state for state in describe_fill_presets(client)}

    def test_everything_installed_makes_both_available(self) -> None:
        states = self.describe(object_info(models=DEFAULT_MODELS))

        self.assertTrue(states["fast"].available, states["fast"].reason)
        self.assertTrue(states["quality"].available, states["quality"].reason)

    def test_fill_needs_no_lanpaint_nodes(self) -> None:
        classes = _template_classes()
        self.assertFalse(any(name.startswith("LanPaint_") for name in classes))
        states = self.describe(object_info(models=DEFAULT_MODELS))
        self.assertTrue(all(state.available for state in states.values()))

    def test_a_missing_core_node_asks_for_a_comfyui_update(self) -> None:
        states = self.describe(
            object_info(missing=frozenset({"TextEncodeQwenImage21"}), models=DEFAULT_MODELS)
        )

        self.assertIn("Update ComfyUI", states["quality"].reason or "")

    def test_a_missing_turbo_lora_leaves_quality_available(self) -> None:
        # Fast is reported unavailable with its reason; it is never swapped for Quality.
        models = {**DEFAULT_MODELS, "LoraLoaderModelOnly": []}
        states = self.describe(object_info(models=models))

        self.assertTrue(states["quality"].available)
        self.assertFalse(states["fast"].available)
        self.assertIn("loras", states["fast"].reason or "")
        self.assertIn("qwen_image_2.1_turbo_lora_avg_rank_178_bf16", states["fast"].reason or "")

    def test_newer_combo_descriptions_are_read_too(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            class_type = request.url.path.removeprefix("/object_info/")
            key = _LOADER_INPUTS.get(class_type)
            required = {}
            if key is not None:
                required[key] = ["COMBO", {"options": DEFAULT_MODELS[class_type]}]
            return httpx.Response(200, json={class_type: {"input": {"required": required}}})

        states = self.describe(handler)

        self.assertTrue(states["fast"].available, states["fast"].reason)

    def test_an_unreachable_comfyui_says_where_it_looked(self) -> None:
        def refused(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("refused", request=request)

        states = self.describe(refused)

        self.assertIn("not reachable", states["quality"].reason or "")
        self.assertIn("Settings > Integrations", states["quality"].reason or "")

    def test_a_missing_template_is_its_own_reason(self) -> None:
        with patch("image_fill_workflow.FILL_TEMPLATES_DIR", Path("nowhere")):
            states = self.describe(object_info(models=DEFAULT_MODELS))

        self.assertIn("missing from this install", states["fast"].reason or "")


class MaskRoleTests(unittest.TestCase):
    """The mask role is new; every preset written before it must parse and run as it did."""

    PRESET: ClassVar[dict[str, dict[str, object]]] = {
        "1": {"class_type": "LoadImage", "inputs": {"image": "a.png"}},
        "2": {"class_type": "SaveImage", "inputs": {"filename_prefix": "x", "images": ["1", 0]}},
    }

    def test_a_preset_without_a_mask_node_has_no_mask_role(self) -> None:
        import json

        workflow = parse_comfy_workflow(json.dumps(self.PRESET), source="plain")

        self.assertIsNone(workflow.mask_node)
        prompt = build_comfy_prompt(workflow, media_ref="in.png", filename_prefix="p")
        self.assertEqual(prompt["1"]["inputs"]["image"], "in.png")
        with self.assertRaisesRegex(ComfyWorkflowError, "DataForge Mask"):
            build_comfy_prompt(workflow, media_ref="in.png", filename_prefix="p", mask_ref="m.png")

    def test_an_untitled_mask_loader_never_becomes_the_source(self) -> None:
        import json

        preset = {
            **self.PRESET,
            "3": {"class_type": "LoadImageMask", "inputs": {"image": "m.png", "channel": "red"}},
        }

        workflow = parse_comfy_workflow(json.dumps(preset), source="masked")

        self.assertEqual(workflow.input_node, "1")
        self.assertIsNone(workflow.mask_node)

    def test_a_titled_mask_is_a_role_not_a_custom_input(self) -> None:
        import json

        preset = {
            **self.PRESET,
            "3": {
                "class_type": "LoadImageMask",
                "inputs": {"image": "m.png", "channel": "red"},
                "_meta": {"title": "DataForge Mask"},
            },
        }

        workflow = parse_comfy_workflow(json.dumps(preset), source="masked")

        self.assertEqual(workflow.mask_node, "3")
        self.assertEqual(workflow.custom_inputs, ())
        prompt = build_comfy_prompt(
            workflow, media_ref="in.png", filename_prefix="p", mask_ref="m2.png"
        )
        self.assertEqual(prompt["3"]["inputs"]["image"], "m2.png")


if __name__ == "__main__":
    unittest.main()
