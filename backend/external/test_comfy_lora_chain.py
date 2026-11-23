import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from external.comfy_lora_chain import (
    LoraRef,
    model_output_index,
    require_model_nodes,
    with_loras,
)
from external.comfy_workflows import ComfyWorkflowError, build_comfy_prompt
from external.test_comfy_workflows import graph, model_graph, node, parse_t2i


class LoraInjectionTests(unittest.TestCase):
    def build(self, payload: dict, *loras: LoraRef, outputs: dict | None = None) -> dict:
        workflow = parse_t2i(payload)
        prompt = build_comfy_prompt(workflow, media_ref=None, filename_prefix="x")
        return with_loras(workflow, prompt, loras, outputs or {})

    def test_loras_chain_in_order_and_only_the_model_link_moves(self) -> None:
        payload = model_graph(
            **{"5": node("CheckpointLoaderSimple", {"ckpt_name": "x"}, "DataForge Model")}
        )
        payload["3"]["inputs"].update(model=["5", 0], clip_in=["5", 1], vae=["5", 2])
        prompt = self.build(payload, LoraRef("a.safetensors", 0.8), LoraRef("b.safetensors", 0.5))

        last = prompt["3"]["inputs"]["model"][0]
        first = prompt[last]["inputs"]["model"][0]
        self.assertEqual(prompt[last]["inputs"]["lora_name"], "b.safetensors")
        self.assertEqual(
            prompt[first]["inputs"],
            {"model": ["5", 0], "lora_name": "a.safetensors", "strength_model": 0.8},
        )
        self.assertEqual(prompt["3"]["inputs"]["clip_in"], ["5", 1])
        self.assertEqual(prompt["3"]["inputs"]["vae"], ["5", 2])

    def test_new_ids_never_collide_with_subgraph_ids(self) -> None:
        payload = model_graph()
        payload["75:12"] = node("VAEDecode", {"samples": ["3", 0]})
        prompt = self.build(payload, LoraRef("a.safetensors", 1.0))

        self.assertEqual(prompt["3"]["inputs"]["model"], ["76", 0])

    def test_injected_loaders_are_never_titled_as_inputs(self) -> None:
        prompt = self.build(model_graph(), LoraRef("a.safetensors", 1.0))
        injected = prompt[prompt["3"]["inputs"]["model"][0]]

        self.assertFalse(injected["_meta"]["title"].startswith("DataForge "))
        self.assertEqual(parse_t2i(prompt).custom_inputs, ())

    def test_the_saved_graph_is_left_alone(self) -> None:
        workflow = parse_t2i(model_graph())
        prompt = build_comfy_prompt(workflow, media_ref=None, filename_prefix="x")
        with_loras(workflow, prompt, [LoraRef("a", 1.0)], {})

        self.assertEqual(workflow.prompt["3"]["inputs"]["model"], ["1", 0])
        self.assertEqual(len(workflow.prompt), 5)

    def test_no_loras_changes_nothing(self) -> None:
        prompt = self.build(model_graph(**{"5": node("UNETLoader", {"unet_name": "y"})}))

        self.assertEqual(prompt["3"]["inputs"]["model"], ["1", 0])

    def test_an_unknown_titled_class_needs_its_model_output(self) -> None:
        sampling = node(
            "ModelSamplingAuraFlow", {"shift": 3.0, "model": ["1", 0]}, "DataForge Model"
        )
        payload = model_graph(**{"5": sampling})
        payload["3"]["inputs"]["model"] = ["5", 0]
        with self.assertRaisesRegex(ComfyWorkflowError, "is its model"):
            self.build(payload, LoraRef("a", 1.0))

        prompt = self.build(payload, LoraRef("a", 1.0), outputs={"5": 0})
        self.assertEqual(prompt[prompt["3"]["inputs"]["model"][0]]["inputs"]["model"], ["5", 0])

    def test_a_model_that_feeds_nothing_is_refused(self) -> None:
        payload = model_graph(**{"8": node("UNETLoader", {"unet_name": "other"}, "Other")})
        payload["3"]["inputs"]["model"] = ["8", 0]
        payload["1"]["_meta"] = {"title": "DataForge Model"}
        with self.assertRaisesRegex(ComfyWorkflowError, "feeds nothing"):
            self.build(payload, LoraRef("a", 1.0))

    def test_model_output_index_reads_object_info(self) -> None:
        self.assertEqual(model_output_index({"output": ["LATENT", "MODEL"]}), 1)
        self.assertIsNone(model_output_index({"output": ["LATENT"]}))
        self.assertIsNone(model_output_index(None))

    def test_every_titled_node_gets_the_chain(self) -> None:
        payload = model_graph(
            **{
                "5": node("UNETLoader", {"unet_name": "low.safetensors"}, "DataForge Model"),
                "6": node("KSampler", {"seed": 1, "model": ["5", 0], "latent_image": ["3", 0]}),
            }
        )
        payload["1"]["_meta"] = {"title": "DataForge Model"}
        payload["9"]["inputs"]["images"] = ["6", 0]
        prompt = self.build(payload, LoraRef("a.safetensors", 1.0))

        for sampler, base in (("3", "1"), ("6", "5")):
            loader = prompt[prompt[sampler]["inputs"]["model"][0]]
            self.assertEqual(loader["class_type"], "LoraLoaderModelOnly")
            self.assertEqual(loader["inputs"]["model"], [base, 0])

    def test_two_untitled_loaders_are_refused_by_name(self) -> None:
        workflow = parse_t2i(
            model_graph(**{"5": node("CheckpointLoaderSimple", {"ckpt_name": "x"})})
        )

        with self.assertRaisesRegex(ComfyWorkflowError, "loads 2 models.*DataForge Model"):
            require_model_nodes(workflow)

    def test_a_graph_without_a_loader_is_refused(self) -> None:
        with self.assertRaisesRegex(ComfyWorkflowError, "no UNETLoader"):
            require_model_nodes(parse_t2i(graph()))


if __name__ == "__main__":
    unittest.main()
