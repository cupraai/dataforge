import sys
import unittest
from pathlib import Path
from typing import ClassVar

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from external.comfy_sourceless import without_source
from external.comfy_workflows import ComfyWorkflow, ComfyWorkflowError, build_comfy_prompt
from external.test_comfy_workflows import model_graph, node, parse_t2i


class WithoutSourceTests(unittest.TestCase):
    """What an image-to-video graph runs on when it is given no image."""

    INFOS: ClassVar[dict[str, dict]] = {
        "I2V": {
            "input": {"optional": {"first_frame": ["IMAGE"], "images": ["GROWING"]}},
            "output": ["CONDITIONING"],
        },
        "SaveImage": {"input": {"optional": {"audio": ["AUDIO"]}}},
        "AnyOf": {"input": {"optional": {"any_1": ["*"], "any_2": ["*"]}}, "output": ["*"]},
        "ComfySwitchNode": {
            "input": {
                "optional": {
                    "on_false": ["COMFY_MATCHTYPE_V3"],
                    "on_true": ["COMFY_MATCHTYPE_V3"],
                }
            }
        },
    }

    def bare(self, payload: dict) -> ComfyWorkflow:
        return without_source(parse_t2i(payload), self.INFOS.get)

    def i2v(self, **overrides: dict) -> dict:
        payload = model_graph(
            **{
                "2": node("LoadImage", {"image": "example.png"}),
                "3": node("I2V", {"seed": 1, "model": ["1", 0], "first_frame": ["2", 0]}),
                "4": node("CLIPTextEncode", {"text": "a cat"}, "DataForge Prompt"),
            }
        )
        payload.update(overrides)
        return payload

    def switched(self, **switch: object) -> dict:
        """The sampler takes its latent from the image, or an empty one."""
        return self.i2v(
            **{
                "3": node("KSampler", {"seed": 1, "model": ["1", 0], "latent": ["7", 0]}),
                "5": node("VAEEncode", {"pixels": ["2", 0]}),
                "6": node("EmptyLatentImage", {"width": 8, "height": 8}),
                "7": node("ComfySwitchNode", {"on_true": ["5", 0], **switch}),
            }
        )

    def test_an_optional_input_lets_go_of_the_loader(self) -> None:
        workflow = self.bare(self.i2v())
        prompt = build_comfy_prompt(workflow, media_ref=None, filename_prefix="x")

        self.assertTrue(workflow.generates)
        self.assertNotIn("2", prompt)
        self.assertEqual(prompt["3"]["inputs"], {"seed": 1, "model": ["1", 0]})

    def test_a_growing_input_is_optional_as_a_whole(self) -> None:
        payload = self.i2v()
        payload["3"]["inputs"] = {"seed": 1, "model": ["1", 0], "images.image_1": ["2", 0]}

        self.assertNotIn("images.image_1", self.bare(payload).prompt["3"]["inputs"])

    def test_the_saved_workflow_is_left_alone(self) -> None:
        workflow = parse_t2i(self.i2v())
        without_source(workflow, self.INFOS.get)

        self.assertEqual(workflow.prompt["3"]["inputs"]["first_frame"], ["2", 0])

    def test_nodes_that_only_prepare_the_image_leave_with_it(self) -> None:
        payload = self.i2v(
            **{
                "5": node("ImageScale", {"image": ["2", 0], "width": 8}),
                "6": node("ImageBlur", {"image": ["5", 0]}, "DataForge Blur"),
                "3": node("I2V", {"seed": 1, "model": ["1", 0], "first_frame": ["6", 0]}),
            }
        )
        payload["6"]["inputs"]["value"] = 3
        workflow = self.bare(payload)

        self.assertEqual(set(workflow.prompt), {"1", "3", "4", "9"})
        # Nothing may be written into a node that left.
        self.assertEqual(workflow.custom_inputs, ())

    def test_an_output_that_needs_the_image_is_refused_by_the_node_that_takes_it(self) -> None:
        payload = self.i2v(
            **{
                "5": node("VAEEncode", {"pixels": ["2", 0]}, "Encode the start"),
                "3": node("KSampler", {"seed": 1, "model": ["1", 0], "latent": ["5", 0]}),
            }
        )
        with self.assertRaisesRegex(ComfyWorkflowError, r'"Encode the start" \(VAEEncode\)'):
            self.bare(payload)

    def test_a_side_output_of_the_loader_is_dropped_from_the_saver(self) -> None:
        payload = self.i2v()
        payload["9"]["inputs"]["audio"] = ["2", 1]

        self.assertNotIn("audio", self.bare(payload).prompt["9"]["inputs"])

    def test_a_switch_passes_on_the_side_that_is_left_whatever_it_selects(self) -> None:
        for selected in (True, False):
            with self.subTest(selected=selected):
                workflow = self.bare(self.switched(switch=selected, on_false=["6", 0]))

                self.assertEqual(workflow.prompt["3"]["inputs"]["latent"], ["6", 0])

    def test_chained_switches_resolve_to_what_is_left(self) -> None:
        payload = self.switched(switch=True, on_false=["6", 0])
        payload["8"] = node("ComfySwitchNode", {"on_true": ["5", 0], "on_false": ["7", 0]})
        payload["3"]["inputs"]["latent"] = ["8", 0]

        self.assertEqual(self.bare(payload).prompt["3"]["inputs"]["latent"], ["6", 0])

    def test_a_switch_with_both_sides_on_the_image_is_refused(self) -> None:
        with self.assertRaisesRegex(ComfyWorkflowError, "VAEEncode"):
            self.bare(self.switched(switch=True, on_false=["5", 0]))

    def test_a_wildcard_node_with_nothing_left_leaves_too(self) -> None:
        payload = self.i2v(
            **{
                "5": node("AnyOf", {"any_1": ["2", 0]}),
                "3": node("KSampler", {"seed": 1, "model": ["1", 0], "latent": ["5", 0]}),
            }
        )
        with self.assertRaisesRegex(ComfyWorkflowError, "AnyOf"):
            self.bare(payload)

        payload["6"] = node("EmptyLatentImage", {"width": 8})
        payload["5"]["inputs"]["any_2"] = ["6", 0]
        self.assertEqual(self.bare(payload).prompt["5"]["inputs"], {"any_2": ["6", 0]})

    def test_a_preset_without_a_loader_is_returned_as_it_is(self) -> None:
        workflow = parse_t2i(model_graph())
        self.assertIs(without_source(workflow, self.INFOS.get), workflow)


if __name__ == "__main__":
    unittest.main()
