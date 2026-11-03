import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx

from external.comfy_client import ComfyError
from external.comfy_execution import ComfyRunCancelled, await_output, request_stop
from testing_fixtures import mock_comfy_client


class AwaitOutputTests(unittest.TestCase):
    def test_a_cancel_mid_image_raises_rather_than_waiting_it_out(self) -> None:
        # run_media_job only checks between files; cancel must also interrupt an in-flight image.
        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/queue":
                return httpx.Response(200, json={"queue_running": [], "queue_pending": []})
            return httpx.Response(200, json={})

        with mock_comfy_client(handler) as client:
            with self.assertRaises(ComfyRunCancelled):
                await_output(
                    client, "p-1", output_node="3", timeout=30.0, should_cancel=lambda: True
                )

    def test_a_finished_run_returns_its_last_output(self) -> None:
        entry = {
            "status": {"completed": True},
            "outputs": {
                "2": {"images": [{"filename": "preview.png", "subfolder": "", "type": "temp"}]},
                "3": {"images": [{"filename": "final.png", "subfolder": "", "type": "output"}]},
            },
        }

        with mock_comfy_client(lambda _r: httpx.Response(200, json={"p-1": entry})) as client:
            ref = await_output(client, "p-1", output_node="3", timeout=30.0, should_cancel=None)

        # Last wins: preview then save lists them in execution order.
        self.assertEqual(ref["filename"], "final.png")

    def test_a_run_that_produced_nothing_says_so(self) -> None:
        entry = {"status": {"completed": True}, "outputs": {"3": {"images": []}}}

        with mock_comfy_client(lambda _r: httpx.Response(200, json={"p-1": entry})) as client:
            with self.assertRaises(ComfyError):
                await_output(client, "p-1", output_node="3", timeout=30.0, should_cancel=None)


class RequestStopTests(unittest.TestCase):
    def _client(self, payload: dict, calls: list[str]) -> httpx.Client:
        def handler(request: httpx.Request) -> httpx.Response:
            calls.append(request.url.path)
            if request.url.path == "/queue" and request.method == "GET":
                return httpx.Response(200, json=payload)
            return httpx.Response(200, json={})

        return mock_comfy_client(handler)

    def test_our_running_prompt_is_interrupted(self) -> None:
        calls: list[str] = []
        payload = {"queue_running": [[0, "p-1", {}]], "queue_pending": []}

        with self._client(payload, calls) as client:
            request_stop(client, "p-1")

        self.assertIn("/interrupt", calls)

    def test_running_prompt_id_is_forwarded_to_interrupt(self) -> None:
        requests: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/queue":
                return httpx.Response(
                    200, json={"queue_running": [[0, "p-1", {}]], "queue_pending": []}
                )
            requests.append(request)
            return httpx.Response(200)

        with mock_comfy_client(handler) as client:
            request_stop(client, "p-1")

        self.assertEqual(len(requests), 1)
        self.assertEqual(requests[0].url.path, "/interrupt")
        self.assertEqual(json.loads(requests[0].content), {"prompt_id": "p-1"})

    def test_someone_elses_prompt_is_never_interrupted(self) -> None:
        # Interrupting here would kill another job's image, or work in the ComfyUI tab.
        calls: list[str] = []
        payload = {"queue_running": [[0, "someone-else", {}]], "queue_pending": []}

        with self._client(payload, calls) as client:
            request_stop(client, "p-1")

        self.assertNotIn("/interrupt", calls)

    def test_a_still_pending_prompt_is_dropped_from_the_queue(self) -> None:
        calls: list[str] = []
        payload = {"queue_running": [[0, "someone-else", {}]], "queue_pending": [[1, "p-1", {}]]}

        with self._client(payload, calls) as client:
            request_stop(client, "p-1")

        self.assertNotIn("/interrupt", calls)
        # The POST to /queue is the delete.
        self.assertEqual(calls.count("/queue"), 2)

    def test_an_unreachable_comfy_stops_quietly(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("refused", request=request)

        with mock_comfy_client(handler) as client:
            request_stop(client, "p-1")


if __name__ == "__main__":
    unittest.main()
