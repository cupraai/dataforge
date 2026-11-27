import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from external.comfy_workflows import (
    ComfyWorkflow,
    ComfyWorkflowError,
    build_comfy_prompt,
    list_comfy_presets,
    load_comfy_workflow,
    parse_comfy_workflow,
    read_comfy_preset_text,
    require_generation,
    require_source_input,
    resolve_custom_inputs,
)


def node(class_type: str, inputs: dict, title: str | None = None) -> dict:
    entry: dict = {"class_type": class_type, "inputs": inputs}
    if title is not None:
        entry["_meta"] = {"title": title}
    return entry


def graph(**overrides: dict) -> dict:
    base = {
        "1": node("LoadImage", {"image": "example.png", "upload": "image"}),
        "2": node(
            "ImageScaleBy", {"upscale_method": "lanczos", "scale_by": 2.0, "image": ["1", 0]}
        ),
        "3": node("SaveImage", {"filename_prefix": "out", "images": ["2", 0]}),
    }
    base.update(overrides)
    return base


def parse(payload: dict, source: str = "upscale-2x"):
    return parse_comfy_workflow(json.dumps(payload), source=source)


def video_graph(**overrides: dict) -> dict:
    """Shaped like the shipped video preset."""
    base = {
        "8": node(
            "VHS_LoadVideo",
            {"video": "example.mp4", "force_rate": ["13", 0], "frame_load_cap": 0},
            "DataForge Input",
        ),
        "5": node("RIFE VFI", {"multiplier": ["15", 0], "frames": ["8", 0]}),
        "11": node(
            "VHS_VideoCombine",
            {
                "frame_rate": ["16", 0],
                "filename_prefix": "video/ComfyUI",
                "format": "video/h264-mp4",
                "images": ["5", 0],
            },
            "DataForge Output",
        ),
        "10": node("SeedNode", {"seed": 42}, "DataForge Seed"),
        "13": node("FloatConstant", {"value": 24}, "DataForge Rate"),
        "15": node("INTConstant", {"value": 2}, "DataForge Multiplier"),
        "16": node("ComfyMathExpression", {"expression": "round(a * b)", "values.a": ["13", 0]}),
    }
    base.update(overrides)
    return base


class VideoGraphTests(unittest.TestCase):
    def test_every_role_resolves_from_its_title(self) -> None:
        workflow = parse(video_graph())

        self.assertEqual(workflow.input_node, "8")
        self.assertEqual(workflow.input_key, "video")
        self.assertEqual(workflow.output_node, "11")
        self.assertEqual(workflow.seed_nodes, ("10",))

    def test_a_still_loader_still_names_its_own_widget(self) -> None:
        self.assertEqual(parse(graph()).input_key, "image")

    def test_an_untitled_video_graph_resolves_by_class(self) -> None:
        payload = {
            "8": node("VHS_LoadVideo", {"video": "example.mp4"}),
            "11": node("VHS_VideoCombine", {"frame_rate": 24, "filename_prefix": "out"}),
        }

        workflow = parse(payload)

        self.assertEqual((workflow.input_node, workflow.output_node), ("8", "11"))

    def test_an_untitled_preview_beside_the_combine_names_the_fix(self) -> None:
        payload = {
            "8": node("VHS_LoadVideo", {"video": "example.mp4"}),
            "9": node("PreviewImage", {"images": ["8", 0]}),
            "11": node("VHS_VideoCombine", {"frame_rate": 24, "filename_prefix": "out"}),
        }

        with self.assertRaises(ComfyWorkflowError) as caught:
            parse(payload)

        self.assertIn("2 output nodes", str(caught.exception))

    def test_a_custom_input_whose_value_is_wired_in_is_refused(self) -> None:
        # Writing over a link would be dropped silently.
        payload = video_graph(
            **{"13": node("FloatConstant", {"value": ["9", 0]}, "DataForge Rate")}
        )

        with self.assertRaises(ComfyWorkflowError) as caught:
            parse(payload)

        self.assertIn("DataForge Rate", str(caught.exception))

    def test_a_loader_with_neither_widget_names_both(self) -> None:
        payload = video_graph(
            **{"8": node("VHS_LoadVideo", {"frame_load_cap": 0}, "DataForge Input")}
        )

        with self.assertRaises(ComfyWorkflowError) as caught:
            parse(payload)

        self.assertIn("'image' or 'video'", str(caught.exception))


class SelfNamingOutputTests(unittest.TestCase):
    """Self-writing nodes take a whole name."""

    def graph(self, **inputs: object) -> dict:
        return {
            "10": node("VHS_LoadVideo", {"video": "example.mp4"}, "DataForge Input"),
            "2": node(
                "SwiftVRRestoreVideo",
                {"output_dir": "output/video", "video": ["10", 0], **inputs},
                "DataForge Output",
            ),
        }

    def test_a_whole_filename_resolves_as_the_output_name(self) -> None:
        workflow = parse(self.graph(filename="ComfyUI.mp4"))

        self.assertEqual(workflow.output_node, "2")
        self.assertEqual(workflow.output_key, "filename")

    def test_the_run_is_scoped_into_the_name_and_the_container_kept(self) -> None:
        """Otherwise every file lands on the exported name."""
        workflow = parse(self.graph(filename="ComfyUI.mp4"))

        prompt = build_comfy_prompt(
            workflow, media_ref="a.mp4", filename_prefix="DataForge/ab12cd34/clip"
        )

        self.assertEqual(prompt["2"]["inputs"]["filename"], "DataForge_ab12cd34_clip.mp4")

    def test_a_name_without_a_container_is_left_without_one(self) -> None:
        workflow = parse(self.graph(filename="ComfyUI"))

        prompt = build_comfy_prompt(
            workflow, media_ref="a.mp4", filename_prefix="DataForge/ab12cd34/clip"
        )

        self.assertEqual(prompt["2"]["inputs"]["filename"], "DataForge_ab12cd34_clip")

    def test_a_prefix_node_still_takes_the_path_shaped_value(self) -> None:
        workflow = parse(graph())

        prompt = build_comfy_prompt(
            workflow, media_ref="a.png", filename_prefix="DataForge/ab12cd34/photo"
        )

        self.assertEqual(prompt["3"]["inputs"]["filename_prefix"], "DataForge/ab12cd34/photo")

    def test_an_output_naming_nothing_names_both_widgets(self) -> None:
        payload = self.graph(output_name="ComfyUI.mp4")

        with self.assertRaises(ComfyWorkflowError) as caught:
            parse(payload)

        self.assertIn("'filename_prefix' or 'filename'", str(caught.exception))

    def test_a_linked_name_is_not_a_writable_widget(self) -> None:
        # Writing over a link would be dropped silently.
        with self.assertRaises(ComfyWorkflowError):
            parse(self.graph(filename=["9", 0]))


class VideoPromptTests(unittest.TestCase):
    def test_the_rate_and_multiplier_are_written_only_when_supplied(self) -> None:
        workflow = parse(video_graph())

        prompt = build_comfy_prompt(
            workflow,
            media_ref="dataforge/clip.mp4",
            filename_prefix="out",
            custom_values=resolve_custom_inputs(workflow, {"Rate": 30}),
        )

        self.assertEqual(prompt["13"]["inputs"]["value"], 30.0)
        self.assertEqual(prompt["15"]["inputs"]["value"], 2)
        self.assertEqual(prompt["8"]["inputs"]["video"], "dataforge/clip.mp4")


class ResolveRolesTests(unittest.TestCase):
    def test_a_single_loader_and_saver_need_no_titles(self) -> None:
        workflow = parse(graph())

        self.assertEqual(workflow.input_node, "1")
        self.assertEqual(workflow.output_node, "3")

    def test_titles_win_over_class_sniffing(self) -> None:
        payload = graph(
            **{
                "1": node("LoadImage", {"image": "a.png"}),
                "4": node("LoadImage", {"image": "b.png"}, "DataForge Input"),
            }
        )

        self.assertEqual(parse(payload).input_node, "4")

    def test_two_loaders_without_a_title_name_the_fix(self) -> None:
        payload = graph(**{"4": node("LoadImage", {"image": "b.png"})})

        with self.assertRaises(ComfyWorkflowError) as caught:
            parse(payload)

        message = str(caught.exception)
        self.assertIn("has 2 input nodes", message)
        self.assertIn("DataForge Input", message)

    def test_two_nodes_sharing_the_marker_are_refused(self) -> None:
        payload = graph(
            **{
                "1": node("LoadImage", {"image": "a.png"}, "DataForge Input"),
                "4": node("LoadImage", {"image": "b.png"}, "DataForge Input"),
            }
        )

        with self.assertRaises(ComfyWorkflowError) as caught:
            parse(payload)

        self.assertIn("Only one node can be the input", str(caught.exception))

    def test_a_graph_with_no_loader_is_a_generation_preset(self) -> None:
        workflow = parse({"3": node("SaveImage", {"filename_prefix": "out"})})

        self.assertTrue(workflow.generates)
        self.assertIsNone(workflow.input_node)
        with self.assertRaises(ComfyWorkflowError) as caught:
            require_source_input(workflow)
        self.assertIn("has no input node", str(caught.exception))
        self.assertIn("Run ComfyUI workflow", str(caught.exception))

    def test_any_source_loader_makes_an_edit_preset(self) -> None:
        workflow = parse(graph())

        self.assertFalse(workflow.generates)
        with self.assertRaises(ComfyWorkflowError) as caught:
            require_generation(workflow)
        self.assertIn("Choose Generate and a start file", str(caught.exception))

    def test_a_mask_loader_alone_still_generates(self) -> None:
        workflow = parse(
            {
                "1": node("LoadImageMask", {"image": "mask.png"}),
                "3": node("SaveImage", {"filename_prefix": "out"}),
            }
        )

        self.assertTrue(workflow.generates)

    def test_a_generation_preset_seeds_its_untitled_samplers(self) -> None:
        """Otherwise every run samples the saved seed."""
        workflow = parse(
            {
                "3": node("KSampler", {"seed": 1, "steps": 20}),
                "4": node("SamplerCustom", {"noise_seed": 2}),
                "5": node("KSampler", {"seed": ["9", 0]}),
                "6": node("PrimitiveInt", {"value": 1024}),
                "9": node("SaveImage", {"filename_prefix": "out"}),
            }
        )

        # The Int is as likely a width.
        self.assertEqual(workflow.seed_nodes, ("3", "4"))

    def test_a_titled_seed_node_wins_over_the_samplers(self) -> None:
        workflow = parse(
            {
                "3": node("KSampler", {"seed": 1}),
                "4": node("PrimitiveInt", {"value": 5}, "DataForge Seed"),
                "9": node("SaveImage", {"filename_prefix": "out"}),
            }
        )

        self.assertEqual(workflow.seed_nodes, ("4",))

    def test_an_edit_preset_never_seeds_untitled_samplers(self) -> None:
        workflow = parse(graph(**{"5": node("KSampler", {"seed": 99})}))

        self.assertEqual(workflow.seed_nodes, ())

    def test_a_preview_node_counts_as_the_output(self) -> None:
        payload = {
            "1": node("LoadImage", {"image": "a.png"}),
            "3": node("PreviewImage", {"images": ["1", 0]}),
        }

        # PreviewImage's output comes from history.
        self.assertEqual(parse(payload).output_node, "3")

    def test_an_optional_seed_node_is_found_by_title(self) -> None:
        payload = graph(
            **{"5": node("KSampler", {"seed": 1, "steps": 20}, "DataForge Seed")},
        )

        self.assertEqual(parse(payload).seed_nodes, ("5",))

    def test_a_titled_seed_node_without_a_seed_input_is_refused(self) -> None:
        payload = graph(**{"5": node("KSampler", {"steps": 20}, "DataForge Seed")})

        with self.assertRaises(ComfyWorkflowError) as caught:
            parse(payload)

        self.assertIn("no seed input", str(caught.exception))


class ParseFailureTests(unittest.TestCase):
    def test_the_editor_format_is_named_as_such(self) -> None:
        # Must name the right ComfyUI menu item.
        raw = json.dumps({"last_node_id": 9, "nodes": [], "links": []})

        with self.assertRaises(ComfyWorkflowError) as caught:
            parse_comfy_workflow(raw, source="upscale-2x")

        message = str(caught.exception)
        self.assertIn("Save (API Format)", message)
        self.assertIn("editor workflow", message)

    def test_broken_json_reports_the_parse_error(self) -> None:
        with self.assertRaises(ComfyWorkflowError) as caught:
            parse_comfy_workflow("{not json", source="upscale-2x")

        self.assertIn("not valid JSON", str(caught.exception))

    def test_json_that_holds_no_nodes_is_refused(self) -> None:
        with self.assertRaises(ComfyWorkflowError) as caught:
            parse_comfy_workflow(json.dumps({"hello": "world"}), source="upscale-2x")

        self.assertIn("no ComfyUI nodes", str(caught.exception))

    def test_an_input_node_taking_no_image_is_refused(self) -> None:
        payload = graph(**{"1": node("LoadImage", {"upload": "image"}, "DataForge Input")})

        with self.assertRaises(ComfyWorkflowError) as caught:
            parse(payload)

        self.assertIn("takes no filename under", str(caught.exception))

    def test_the_preset_name_appears_in_every_message(self) -> None:
        with self.assertRaises(ComfyWorkflowError) as caught:
            parse_comfy_workflow("{", source="my-preset")

        self.assertIn('"my-preset"', str(caught.exception))


class PromptNodeTests(unittest.TestCase):
    def test_a_prompt_node_whose_text_is_wired_in_is_refused(self) -> None:
        # Writing over a link would be dropped silently.
        payload = graph(**{"7": node("CLIPTextEncode", {"text": ["9", 0]}, "DataForge Prompt")})

        with self.assertRaises(ComfyWorkflowError) as caught:
            parse_comfy_workflow(json.dumps(payload), source="my-preset")

        self.assertIn("DataForge Prompt", str(caught.exception))
        self.assertIn("no text input", str(caught.exception))

    def test_a_prompt_node_is_optional(self) -> None:
        self.assertIsNone(parse(graph()).prompt_node)

    def test_two_nodes_with_the_title_leave_it_unresolved(self) -> None:
        """Ambiguous means no node."""
        payload = graph(
            **{
                "7": node("CLIPTextEncode", {"text": "one"}, "DataForge Prompt"),
                "8": node("CLIPTextEncode", {"text": "two"}, "DataForge Prompt"),
            }
        )

        self.assertIsNone(parse(payload).prompt_node)


class CustomInputTests(unittest.TestCase):
    def test_each_custom_title_becomes_an_input_typed_by_its_value(self) -> None:
        payload = graph(
            **{
                "5": node("PrimitiveInt", {"value": 4}, "DataForge Steps"),
                "6": node("PrimitiveBoolean", {"value": True}, "DataForge Tiled"),
                "7": node("PrimitiveString", {"value": "lanczos"}, "DataForge Method"),
            }
        )

        inputs = parse(payload).custom_inputs

        self.assertEqual(
            [(entry.name, entry.kind, entry.default) for entry in inputs],
            [("Method", "text", "lanczos"), ("Steps", "integer", 4), ("Tiled", "boolean", True)],
        )

    def test_a_float_node_saved_with_a_whole_value_is_still_a_number(self) -> None:
        # Only the class tells a float from an int.
        payload = graph(**{"5": node("FloatConstant", {"value": 24}, "DataForge Strength")})

        self.assertEqual(parse(payload).custom_inputs[0].kind, "number")

    def test_the_fixed_roles_are_not_custom_inputs(self) -> None:
        self.assertEqual(
            [entry.name for entry in parse(video_graph()).custom_inputs], ["Multiplier", "Rate"]
        )

    def test_a_node_with_its_only_literal_under_another_key_is_used(self) -> None:
        payload = graph(
            **{"5": node("CustomScale", {"factor": 2.0, "image": ["1", 0]}, "DataForge Scale")}
        )

        self.assertEqual(parse(payload).custom_inputs[0].key, "factor")

    def test_a_titled_node_with_no_single_value_is_refused(self) -> None:
        payload = graph(**{"5": node("KSampler", {"steps": 20, "cfg": 7.0}, "DataForge Detail")})

        with self.assertRaises(ComfyWorkflowError) as caught:
            parse(payload)

        self.assertIn("DataForge Detail", str(caught.exception))

    def test_two_nodes_with_one_title_leave_it_unresolved(self) -> None:
        payload = graph(
            **{
                "5": node("PrimitiveInt", {"value": 1}, "DataForge Steps"),
                "6": node("PrimitiveInt", {"value": 2}, "DataForge Steps"),
            }
        )

        self.assertEqual(parse(payload).custom_inputs, ())

    def test_values_are_written_and_left_out_names_run_as_saved(self) -> None:
        workflow = parse(
            graph(
                **{
                    "5": node("PrimitiveInt", {"value": 4}, "DataForge Steps"),
                    "6": node("PrimitiveFloat", {"value": 0.5}, "DataForge Denoise"),
                }
            )
        )

        values = resolve_custom_inputs(workflow, {"Steps": 8})
        prompt = build_comfy_prompt(
            workflow, media_ref="a.png", filename_prefix="out", custom_values=values
        )

        self.assertEqual(prompt["5"]["inputs"]["value"], 8)
        self.assertEqual(prompt["6"]["inputs"]["value"], 0.5)

    def test_a_whole_number_input_refuses_a_fraction_and_a_boolean(self) -> None:
        workflow = parse(graph(**{"5": node("PrimitiveInt", {"value": 4}, "DataForge Steps")}))

        for value in (2.5, True):
            with self.subTest(value=value), self.assertRaises(ComfyWorkflowError) as caught:
                resolve_custom_inputs(workflow, {"Steps": value})
            self.assertIn("whole number", str(caught.exception))

    def test_an_unknown_name_is_refused(self) -> None:
        workflow = parse(graph())

        with self.assertRaises(ComfyWorkflowError) as caught:
            resolve_custom_inputs(workflow, {"Steps": 8})

        self.assertIn("DataForge Steps", str(caught.exception))


class BuildPromptTests(unittest.TestCase):
    def test_a_generation_preset_takes_no_source(self) -> None:
        workflow = parse({"9": node("SaveImage", {"filename_prefix": "out"})})

        prompt = build_comfy_prompt(workflow, media_ref=None, filename_prefix="DataForge/g/x")

        self.assertEqual(prompt["9"]["inputs"]["filename_prefix"], "DataForge/g/x")
        with self.assertRaises(ComfyWorkflowError):
            build_comfy_prompt(workflow, media_ref="a.png", filename_prefix="out")

    def test_an_edit_preset_refuses_to_run_without_a_source(self) -> None:
        with self.assertRaises(ComfyWorkflowError):
            build_comfy_prompt(parse(graph()), media_ref=None, filename_prefix="out")

    def test_the_saved_prompt_text_is_kept_for_the_caption(self) -> None:
        workflow = parse(
            graph(**{"7": node("CLIPTextEncode", {"text": "as saved"}, "DataForge Prompt")})
        )

        self.assertEqual(workflow.saved_prompt_text, "as saved")

    def test_the_image_and_prefix_are_filled_in(self) -> None:
        workflow = parse(graph())

        prompt = build_comfy_prompt(
            workflow,
            media_ref="dataforge/ab12_00001.png",
            filename_prefix="DataForge/ab12/photo",
        )

        self.assertEqual(prompt["1"]["inputs"]["image"], "dataforge/ab12_00001.png")
        self.assertEqual(prompt["3"]["inputs"]["filename_prefix"], "DataForge/ab12/photo")

    def test_the_source_graph_is_never_mutated(self) -> None:
        payload = graph()
        workflow = parse(payload)

        build_comfy_prompt(workflow, media_ref="new.png", filename_prefix="out")

        # A leaked patch would carry values between images.
        self.assertEqual(workflow.prompt["1"]["inputs"]["image"], "example.png")

    def test_the_presets_own_seed_is_left_alone_by_default(self) -> None:
        workflow = parse(graph(**{"5": node("KSampler", {"seed": 99}, "DataForge Seed")}))

        prompt = build_comfy_prompt(workflow, media_ref="a.png", filename_prefix="out")

        self.assertEqual(prompt["5"]["inputs"]["seed"], 99)

    def test_a_supplied_seed_overwrites_the_titled_node(self) -> None:
        workflow = parse(graph(**{"5": node("KSampler", {"seed": 99}, "DataForge Seed")}))

        prompt = build_comfy_prompt(workflow, media_ref="a.png", filename_prefix="out", seed=1234)

        self.assertEqual(prompt["5"]["inputs"]["seed"], 1234)

    def test_a_noise_seed_input_is_patched_too(self) -> None:
        workflow = parse(graph(**{"5": node("SamplerCustom", {"noise_seed": 5}, "DataForge Seed")}))

        prompt = build_comfy_prompt(workflow, media_ref="a.png", filename_prefix="out", seed=77)

        self.assertEqual(prompt["5"]["inputs"]["noise_seed"], 77)

    def test_a_native_int_node_value_is_patched_as_the_seed(self) -> None:
        workflow = parse(graph(**{"5": node("PrimitiveInt", {"value": 5}, "DataForge Seed")}))

        prompt = build_comfy_prompt(workflow, media_ref="a.png", filename_prefix="out", seed=77)

        self.assertEqual(prompt["5"]["inputs"]["value"], 77)

    def test_the_presets_own_prompt_is_left_alone_by_default(self) -> None:
        workflow = parse(
            graph(**{"7": node("CLIPTextEncode", {"text": "as saved"}, "DataForge Prompt")})
        )

        prompt = build_comfy_prompt(workflow, media_ref="a.png", filename_prefix="out")

        self.assertEqual(prompt["7"]["inputs"]["text"], "as saved")

    def test_supplied_text_overwrites_the_titled_prompt_node(self) -> None:
        workflow = parse(
            graph(**{"7": node("CLIPTextEncode", {"text": "as saved"}, "DataForge Prompt")})
        )

        prompt = build_comfy_prompt(
            workflow, media_ref="a.png", filename_prefix="out", prompt_text="sharp photograph"
        )

        self.assertEqual(prompt["7"]["inputs"]["text"], "sharp photograph")

    def test_a_multiline_text_node_takes_the_prompt_under_value(self) -> None:
        workflow = parse(
            graph(**{"7": node("PrimitiveStringMultiline", {"value": ""}, "DataForge Prompt")})
        )

        prompt = build_comfy_prompt(
            workflow, media_ref="a.png", filename_prefix="out", prompt_text="sharp photograph"
        )

        self.assertEqual(prompt["7"]["inputs"]["value"], "sharp photograph")

    def test_an_encoder_takes_the_prompt_under_prompt(self) -> None:
        workflow = parse(
            graph(**{"7": node("TextEncodeQwenImageEdit", {"prompt": ""}, "DataForge Prompt")})
        )

        prompt = build_comfy_prompt(
            workflow, media_ref="a.png", filename_prefix="out", prompt_text="sharp photograph"
        )

        self.assertEqual(prompt["7"]["inputs"]["prompt"], "sharp photograph")

    def test_a_preview_output_survives_the_prefix_patch(self) -> None:
        workflow = parse(
            {
                "1": node("LoadImage", {"image": "a.png"}),
                "3": node("PreviewImage", {"images": ["1", 0]}),
            }
        )

        prompt = build_comfy_prompt(workflow, media_ref="b.png", filename_prefix="out")

        self.assertNotIn("filename_prefix", prompt["3"]["inputs"])


class PresetDiscoveryTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp = tempfile.TemporaryDirectory()
        self.folder = Path(self._temp.name)
        self._previous = __import__("os").environ.get("COMFY_WORKFLOWS_DIR")
        __import__("os").environ["COMFY_WORKFLOWS_DIR"] = str(self.folder)

    def tearDown(self) -> None:
        import os

        if self._previous is None:
            os.environ.pop("COMFY_WORKFLOWS_DIR", None)
        else:
            os.environ["COMFY_WORKFLOWS_DIR"] = self._previous
        self._temp.cleanup()

    def write(self, name: str, payload: dict | str) -> Path:
        path = self.folder / f"{name}.json"
        path.write_text(
            payload if isinstance(payload, str) else json.dumps(payload), encoding="utf-8"
        )
        return path

    def test_presets_are_listed_by_filename_stem(self) -> None:
        self.write("upscale-2x", graph())
        self.write("fix-faces", graph())

        self.assertEqual(
            [preset.name for preset in list_comfy_presets()], ["fix-faces", "upscale-2x"]
        )

    def test_listing_distinguishes_edit_and_generation_presets(self) -> None:
        self.write("upscale-2x", graph())
        self.write("txt2img", {"9": node("SaveImage", {"filename_prefix": "out"})})
        self.write("broken", "{not json")

        self.assertEqual(
            {preset.name: preset.generates for preset in list_comfy_presets()},
            {"broken": None, "txt2img": True, "upscale-2x": False},
        )

    def test_listing_reports_the_prompt_and_seed_fields_the_dialog_can_offer(self) -> None:
        self.write("plain", graph())
        self.write("sampler", model_graph())
        self.write(
            "both",
            graph(
                **{
                    "5": node("KSampler", {"seed": 1}, "DataForge Seed"),
                    "7": node("CLIPTextEncode", {"text": "as saved"}, "DataForge Prompt"),
                }
            ),
        )
        self.write("broken", "{not json")

        self.assertEqual(
            {
                preset.name: (preset.accepts_prompt, preset.accepts_seed)
                for preset in list_comfy_presets()
            },
            {
                "plain": (False, False),
                "sampler": (False, True),
                "both": (True, True),
                "broken": (None, None),
            },
        )

    def test_a_missing_folder_lists_nothing(self) -> None:
        import os

        os.environ["COMFY_WORKFLOWS_DIR"] = str(self.folder / "nope")

        self.assertEqual(list_comfy_presets(), [])

    def test_loading_parses_the_named_preset(self) -> None:
        self.write("upscale-2x", graph())

        self.assertEqual(load_comfy_workflow("upscale-2x").preset, "upscale-2x")

    def test_an_unknown_preset_says_so(self) -> None:
        with self.assertRaises(ComfyWorkflowError) as caught:
            read_comfy_preset_text("nope")

        self.assertIn("No workflow preset", str(caught.exception))

    def test_a_name_that_walks_the_filesystem_is_refused(self) -> None:
        for name in ("", "..", "../secrets", r"..\secrets", "sub/preset"):
            with self.subTest(name=name), self.assertRaises(ComfyWorkflowError):
                read_comfy_preset_text(name)

    def test_the_listing_says_what_a_showcase_can_use(self) -> None:
        self.write("t2i", model_graph())
        self.write("i2v", model_graph(**{"7": node("LoadImage", {"image": "start.png"})}))
        self.write("upscale", graph())
        presets = {preset.name: preset for preset in list_comfy_presets()}

        self.assertEqual(presets["t2i"].accepts_loras, True)
        self.assertIsNone(presets["t2i"].source_kind)
        self.assertEqual(presets["i2v"].source_kind, "image")
        # Edit never seeds the sampler of a preset that loads a file; a showcase does.
        self.assertEqual(presets["i2v"].accepts_seed, False)
        self.assertEqual(presets["i2v"].accepts_generation_seed, True)
        self.assertEqual(presets["upscale"].accepts_loras, False)


class ShippedExampleTests(unittest.TestCase):
    def test_the_example_preset_parses(self) -> None:
        # The shipped example is the fixture.
        path = Path(__file__).resolve().parents[2] / "comfy_workflows" / "example_lanczos_2x.json"
        workflow = parse_comfy_workflow(path.read_text(encoding="utf-8"), source=path.stem)

        self.assertEqual(workflow.input_node, "1")
        self.assertEqual(workflow.output_node, "3")

    def test_the_generation_example_parses(self) -> None:
        path = Path(__file__).resolve().parents[2] / "comfy_workflows" / "example_solid_color.json"
        workflow = parse_comfy_workflow(path.read_text(encoding="utf-8"), source=path.stem)

        self.assertTrue(workflow.generates)
        self.assertEqual([entry.name for entry in workflow.custom_inputs], ["Batch size", "Color"])


def model_graph(**overrides: dict) -> dict:
    """A text-to-image graph: one diffusion model feeding one sampler."""
    base = {
        "1": node("UNETLoader", {"unet_name": "base.safetensors", "weight_dtype": "default"}),
        "2": node("CLIPLoader", {"clip_name": "te.safetensors"}),
        "3": node("KSampler", {"seed": 1, "model": ["1", 0], "positive": ["4", 0]}),
        "4": node("CLIPTextEncode", {"text": "a cat", "clip": ["2", 0]}),
        "9": node("SaveImage", {"filename_prefix": "out", "images": ["3", 0]}),
    }
    base.update(overrides)
    return base


def parse_t2i(payload: dict) -> ComfyWorkflow:
    return parse_comfy_workflow(json.dumps(payload), source="showcase")


class ModelNodeTests(unittest.TestCase):
    def test_a_titled_model_node_is_a_role_not_a_custom_input(self) -> None:
        payload = model_graph()
        payload["1"]["_meta"] = {"title": "DataForge Model"}
        workflow = parse_t2i(payload)

        self.assertEqual(workflow.model_nodes, ("1",))
        self.assertEqual(workflow.custom_inputs, ())

    def test_the_only_loader_needs_no_title(self) -> None:
        self.assertEqual(parse_t2i(model_graph()).model_nodes, ("1",))

    def test_two_untitled_loaders_are_none(self) -> None:
        payload = model_graph(**{"5": node("CheckpointLoaderSimple", {"ckpt_name": "x"})})
        self.assertEqual(parse_t2i(payload).model_nodes, ())


if __name__ == "__main__":
    unittest.main()
