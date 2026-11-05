from __future__ import annotations

import json
import unittest
from urllib.parse import quote

from routes._test_client import client
from testing_fixtures import TempMediaFolder, write_media, write_safetensors, write_txt_caption


class ModelInfoEndpointTests(unittest.TestCase):
    def test_reports_the_header(self) -> None:
        metadata = {"name": "subject_lora", "training_info": json.dumps({"step": 500, "epoch": 1})}
        tensors = {"layer.lora_A.weight": ("BF16", [4, 8]), "layer.lora_B.weight": ("BF16", [8, 4])}
        with TempMediaFolder() as root:
            model = write_safetensors(root, tensors=tensors, metadata=metadata)

            response = client.get(f"/api/media/model-info?path={quote(str(model))}")

            self.assertEqual(response.status_code, 200)
            payload = response.json()
            self.assertEqual(payload["path"], str(model))
            self.assertEqual(payload["title"], "subject_lora")
            self.assertEqual(payload["step"], 500)
            self.assertEqual(payload["rank"], 4)
            self.assertEqual(payload["tensor_count"], 2)
            self.assertEqual(payload["precision"], "BF16")
            self.assertEqual(payload["metadata"]["name"], "subject_lora")

    def test_an_unreadable_header_is_a_422(self) -> None:
        with TempMediaFolder() as root:
            model = root / "broken.safetensors"
            model.write_bytes(b"\x00" * 8)

            response = client.get(f"/api/media/model-info?path={quote(str(model))}")

            self.assertEqual(response.status_code, 422)
            self.assertEqual(response.json()["detail"], "Could not read this file's header")

    def test_refuses_media_that_is_not_a_model(self) -> None:
        with TempMediaFolder() as root:
            image = write_media(root, "photo.png")

            response = client.get(f"/api/media/model-info?path={quote(str(image))}")

            self.assertEqual(response.status_code, 400)


class ModelCaptionTests(unittest.TestCase):
    def test_caption_routes_refuse_a_model(self) -> None:
        with TempMediaFolder() as root:
            path = quote(str(write_safetensors(root)))

            responses = [
                client.get(f"/api/caption?path={path}"),
                client.get(f"/api/caption/backup?path={path}"),
                client.put(f"/api/caption?path={path}", json={"text": "x", "base_revision": None}),
            ]

            for response in responses:
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()["detail"], "This file does not take captions")

    def test_deleting_a_model_leaves_the_same_stem_caption(self) -> None:
        with TempMediaFolder() as root:
            model = write_safetensors(root, "subject.safetensors")
            caption = write_txt_caption(write_media(root, "subject.png"), "The image's caption.")

            response = client.delete(f"/api/media?path={quote(str(model))}")

            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["deleted"], ["subject.safetensors"])
            self.assertFalse(model.exists())
            self.assertTrue(caption.is_file())

    def test_moving_the_image_takes_its_caption_past_a_same_stem_model(self) -> None:
        with TempMediaFolder() as root:
            destination = root / "Destination"
            destination.mkdir()
            model = write_safetensors(root, "subject.safetensors")
            image = write_media(root, "subject.png")
            write_txt_caption(image, "The image's caption.")

            response = client.post(
                f"/api/media/move?destination={quote(str(destination))}",
                json={"paths": [str(image)]},
            )

            self.assertEqual(response.status_code, 200)
            self.assertTrue((destination / "subject.txt").is_file())
            self.assertFalse((root / "subject.txt").exists())
            self.assertTrue(model.is_file())

    def test_moving_a_model_leaves_the_caption_behind(self) -> None:
        with TempMediaFolder() as root:
            destination = root / "Destination"
            destination.mkdir()
            model = write_safetensors(root, "subject.safetensors")
            caption = write_txt_caption(write_media(root, "subject.png"), "The image's caption.")

            response = client.post(
                f"/api/media/move?destination={quote(str(destination))}",
                json={"paths": [str(model)]},
            )

            self.assertEqual(response.status_code, 200)
            self.assertTrue((destination / "subject.safetensors").is_file())
            self.assertFalse((destination / "subject.txt").exists())
            self.assertTrue(caption.is_file())


if __name__ == "__main__":
    unittest.main()
