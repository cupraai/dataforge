from __future__ import annotations

import unittest
from unittest.mock import patch

import httpx

from comfy_loras import describe_lora, list_comfy_loras
from routes._test_client import client
from testing_fixtures import mock_comfy_client


def _serving(names: list[str] | None, *, status: int = 200):
    def handler(request: httpx.Request) -> httpx.Response:
        if names is None:
            return httpx.Response(status, json={})
        spec = {"input": {"required": {"lora_name": ["COMBO", {"options": names}]}}}
        return httpx.Response(status, json={"LoraLoaderModelOnly": spec})

    return patch("comfy_loras.open_comfy_client", lambda _timeout: mock_comfy_client(handler))


class DescribeLoraTests(unittest.TestCase):
    def test_a_numbered_save_names_its_run_and_step(self) -> None:
        lora = describe_lora("H3\\run_v7_000001500.safetensors")

        self.assertEqual((lora.stem, lora.run, lora.step), ("run_v7_000001500", "run_v7", 1500))
        self.assertEqual(lora.name, "H3\\run_v7_000001500.safetensors")

    def test_a_final_save_is_its_own_run(self) -> None:
        lora = describe_lora("loras/run_v7.safetensors")

        self.assertEqual((lora.stem, lora.run, lora.step), ("run_v7", "run_v7", None))

    def test_only_nine_digits_make_a_step(self) -> None:
        self.assertIsNone(describe_lora("style_v2_1000.safetensors").step)
        self.assertEqual(describe_lora("plain").stem, "plain")


class ListComfyLorasTests(unittest.TestCase):
    def test_lists_what_comfyui_can_load(self) -> None:
        with _serving(["a.safetensors", "H3\\b_000000250.safetensors"]):
            response = list_comfy_loras()

        self.assertTrue(response.available)
        self.assertEqual([lora.stem for lora in response.loras], ["a", "b_000000250"])
        self.assertEqual(response.loras[1].step, 250)

    def test_a_missing_lora_loader_is_an_error_not_an_outage(self) -> None:
        with _serving(None):
            response = list_comfy_loras()

        self.assertTrue(response.available)
        self.assertEqual(response.loras, [])
        self.assertIn("did not list", response.error or "")

    def test_a_stopped_comfyui_is_unavailable(self) -> None:
        def refuse(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("refused", request=request)

        with patch("comfy_loras.open_comfy_client", lambda _timeout: mock_comfy_client(refuse)):
            response = client.get("/api/automation/comfy-showcase/loras")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"loras": [], "available": False, "error": None})


if __name__ == "__main__":
    unittest.main()
