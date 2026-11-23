from __future__ import annotations

import json
import unittest

from comfy_embedded_generation import embedded_generation, generation_graph
from comfy_prompts import extract_workflow_prompts, load_embedded_generation
from external.comfy_workflows import ComfyWorkflowError
from testing_fixtures import TempMediaFolder, write_media

#: One text-to-image output and one that re-renders an uploaded image, sharing the model.
TWO_OUTPUTS = {
    "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "model.safetensors"}},
    "2": {"class_type": "CLIPTextEncode", "inputs": {"text": "a lighthouse", "clip": ["1", 1]}},
    "3": {"class_type": "CLIPTextEncode", "inputs": {"text": "blurry", "clip": ["1", 1]}},
    "4": {"class_type": "EmptyLatentImage", "inputs": {"width": 512, "height": 512}},
    "5": {
        "class_type": "KSampler",
        "inputs": {
            "model": ["1", 0],
            "positive": ["2", 0],
            "negative": ["3", 0],
            "latent_image": ["4", 0],
            "seed": 7,
            "steps": 20,
        },
    },
    "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
    "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "txt"}},
    "8": {"class_type": "LoadImage", "inputs": {"image": "reference.png"}},
    "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0], "filename_prefix": "ref"}},
}


def _title(node: dict) -> str | None:
    return node.get("_meta", {}).get("title")


class GenerationGraphTests(unittest.TestCase):
    def test_it_keeps_only_what_the_output_needs_and_titles_its_roles(self) -> None:
        trimmed = generation_graph(TWO_OUTPUTS, "7", ["2"])

        assert trimmed is not None
        self.assertEqual(sorted(trimmed), ["1", "2", "3", "4", "5", "6", "7"])
        self.assertEqual(_title(trimmed["7"]), "DataForge Output")
        self.assertEqual(_title(trimmed["2"]), "DataForge Prompt")
        self.assertIsNone(_title(trimmed["3"]))
        self.assertNotIn("_meta", TWO_OUTPUTS["2"])

    def test_a_prompt_node_the_graph_already_titles_is_kept(self) -> None:
        graph = json.loads(json.dumps(TWO_OUTPUTS))
        graph["3"]["_meta"] = {"title": "DataForge Prompt"}

        trimmed = generation_graph(graph, "7", ["2"])

        assert trimmed is not None
        self.assertEqual(_title(trimmed["3"]), "DataForge Prompt")
        self.assertIsNone(_title(trimmed["2"]))

    def test_a_link_to_a_missing_node_cannot_run(self) -> None:
        graph = {
            "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "x"}}
        }

        self.assertIsNone(generation_graph(graph, "7", []))

    def test_only_the_output_that_loads_no_file_generates(self) -> None:
        txt = embedded_generation(TWO_OUTPUTS, "7", ["2"], source="render")
        ref = embedded_generation(TWO_OUTPUTS, "9", [], source="render")

        assert txt is not None
        self.assertEqual(txt.output_node, "7")
        self.assertEqual(txt.saved_prompt_text, "a lighthouse")
        self.assertEqual(txt.seed_nodes, ("5",))
        self.assertIsNone(ref)


class EmbeddedFileTests(unittest.TestCase):
    def test_extraction_marks_each_output_that_can_generate(self) -> None:
        with TempMediaFolder() as root:
            media = write_media(root, "render.png", text_chunks={"prompt": json.dumps(TWO_OUTPUTS)})
            branches = {
                branch.node_id: branch for branch in extract_workflow_prompts(media).branches
            }

        generation = branches["7"].generation
        assert generation is not None
        self.assertEqual(generation.prompt_node, "2")
        self.assertIsNone(branches["9"].generation)

    def test_loading_names_why_an_output_cannot_generate(self) -> None:
        with TempMediaFolder() as root:
            media = write_media(root, "render.png", text_chunks={"prompt": json.dumps(TWO_OUTPUTS)})

            self.assertEqual(load_embedded_generation(media, "7").preset, "render")
            with self.assertRaises(ComfyWorkflowError) as source_file:
                load_embedded_generation(media, "9")
            with self.assertRaises(ComfyWorkflowError) as missing:
                load_embedded_generation(media, "42")

        self.assertIn("edits files instead of making new ones", str(source_file.exception))
        self.assertIn("no output node 42", str(missing.exception))


if __name__ == "__main__":
    unittest.main()
