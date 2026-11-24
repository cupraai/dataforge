from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from automation.served_model import ServedModel
from routes._test_client import client


class SystemSpecsEndpointTests(unittest.TestCase):
    @patch("routes.system.get_system_specs")
    def test_returns_system_specs(self, get_specs_mock) -> None:
        from system_specs import SystemSpecs

        get_specs_mock.return_value = SystemSpecs(
            cpu_name="Intel Core i7-12700K",
            cpu_cores=16,
            cpu_load_percent=37.5,
            cpu_temperature_celsius=54.0,
            cpu_power_watts=95.5,
            memory_total_bytes=32 * 1024**3,
            memory_used_bytes=8 * 1024**3,
            gpu_name="NVIDIA GeForce RTX 3080",
            gpu_memory_bytes=10 * 1024**3,
            gpu_memory_used_bytes=4 * 1024**3,
            gpu_load_percent=91.0,
            gpu_temperature_celsius=72.0,
            gpu_power_watts=280.0,
            gpu_power_limit_watts=320.0,
            gpu_fan_percent=55.0,
            gpu_available=True,
        )

        response = client.get("/api/system/specs")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "cpu_name": "Intel Core i7-12700K",
                "cpu_cores": 16,
                "cpu_load_percent": 37.5,
                "cpu_temperature_celsius": 54.0,
                "cpu_power_watts": 95.5,
                "memory_total_bytes": 32 * 1024**3,
                "memory_used_bytes": 8 * 1024**3,
                "gpu_name": "NVIDIA GeForce RTX 3080",
                "gpu_memory_bytes": 10 * 1024**3,
                "gpu_memory_used_bytes": 4 * 1024**3,
                "gpu_load_percent": 91.0,
                "gpu_temperature_celsius": 72.0,
                "gpu_power_watts": 280.0,
                "gpu_power_limit_watts": 320.0,
                "gpu_fan_percent": 55.0,
                "gpu_available": True,
            },
        )


class SystemPerformanceEndpointTests(unittest.TestCase):
    @patch("system_performance.gpu_details")
    def test_serves_the_machine_with_drives_and_per_core_load(self, details) -> None:
        from system_performance import GpuDetails

        details.return_value = GpuDetails()

        response = client.get("/api/system/performance")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertGreater(body["cpu_threads"], 0)
        self.assertIsInstance(body["cpu_core_load_percents"], list)
        self.assertIsInstance(body["disks"], list)
        for disk in body["disks"]:
            self.assertEqual(
                set(disk), {"name", "mountpoint", "filesystem", "total_bytes", "used_bytes"}
            )
        self.assertIn("process_memory_bytes", body)


class VisionLlmInfoEndpointTests(unittest.TestCase):
    @patch("routes.system.model_client")
    @patch("routes.system.get_openai_base_url", return_value="http://127.0.0.1:8888/v1")
    @patch("routes.system.get_openai_model", return_value="qwen38")
    def test_returns_the_configured_and_served_model(self, _model, _base_url, _client) -> None:
        cases = (
            (ServedModel("Qwen3.8-27B.gguf", ("low", "xhigh")), ["low", "xhigh"]),
            (ServedModel("gemma", ()), []),
            (ServedModel(problem="The server refused the API key"), None),
            (ServedModel(problem="The server did not answer", reachable=False), None),
        )
        for served, efforts in cases:
            with (
                self.subTest(served=served),
                patch("routes.system.read_served_model", return_value=served) as read,
            ):
                response = client.get("/api/system/vision-llm")

                self.assertEqual(response.status_code, 200)
                self.assertEqual(
                    response.json(),
                    {
                        "model": "qwen38",
                        "base_url": "http://127.0.0.1:8888/v1",
                        "served_model": served.model,
                        "reasoning_efforts": efforts,
                        "detail": served.problem,
                        "reachable": served.reachable,
                    },
                )
                self.assertEqual(read.call_args.args[1], "qwen38")


class RetagEndpointTests(unittest.TestCase):
    def test_queues_every_tagged_file_and_wakes_the_tagger(self) -> None:
        with (
            patch("tagging_worker.queue_all_for_retag", return_value=3),
            patch("tagging_worker.wake_tagging_worker") as wake,
        ):
            response = client.post("/api/system/tagging/retag")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"queued": 3})
        wake.assert_called_once()


class TagVocabularyEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.path = Path(temp.name) / "tag_vocabulary.txt"
        patcher = patch("tagger.PERSONAL_VOCABULARY_PATH", self.path)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_saves_the_terms_and_counts_what_they_add(self) -> None:
        self.assertEqual(client.get("/api/system/tagging/vocabulary").json()["text"], "")

        body = client.put(
            "/api/system/tagging/vocabulary", json={"text": "# mine\nzzz term one\nzzz term two"}
        ).json()

        self.assertEqual(body["text"], "# mine\nzzz term one\nzzz term two\n")
        self.assertEqual(body["added_count"], 2)
        self.assertGreater(body["default_count"], 100)
        self.assertEqual(self.path.read_text(encoding="utf-8"), body["text"])

    def test_refuses_an_oversized_list_with_a_reason(self) -> None:
        response = client.put("/api/system/tagging/vocabulary", json={"text": "x" * 200_000})

        self.assertEqual(response.status_code, 422)
        self.assertIn("at most", response.json()["detail"])
        self.assertFalse(self.path.exists())


class AboutEndpointTests(unittest.TestCase):
    def test_reports_the_version_and_where_ffmpeg_came_from(self) -> None:
        with patch("about.locate_ffmpeg", return_value=("/opt/ffmpeg/bin/ffmpeg", "path")):
            body = client.get("/api/system/about").json()

        self.assertRegex(body["version"], r"^\d+\.\d+\.\d+")
        self.assertEqual(body["ffmpeg_path"], "/opt/ffmpeg/bin/ffmpeg")
        self.assertEqual(body["ffmpeg_source"], "path")
        self.assertTrue(body["database_path"])
        self.assertTrue(body["workflows_dir"])
        for key in (
            "tag_vocabulary_path",
            "tagging_models_dir",
            "watermark_image_path",
        ):
            self.assertTrue(body[key], key)

    def test_says_so_when_ffmpeg_is_missing(self) -> None:
        with patch("about.locate_ffmpeg", return_value=None):
            body = client.get("/api/system/about").json()

        self.assertIsNone(body["ffmpeg_path"])
        self.assertIsNone(body["ffmpeg_source"])


if __name__ == "__main__":
    unittest.main()
