from __future__ import annotations

import io
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import quote, urlencode

import httpx
from PIL import Image

import image_fill_jobs
from image_fill import file_digest, save_result
from routes._test_client import client
from schemas import FillBox
from test_image_fill import ResultsFolder, make_fill, mask_png, painted, solid_asset
from test_image_fill_workflow import DEFAULT_MODELS, object_info
from testing_fixtures import TempMediaFolder, claimed_elsewhere, mock_comfy_client

FILL_URL = "/api/media/image-fill"


def url(suffix: str = "", **params: str) -> str:
    return f"{FILL_URL}{suffix}?{urlencode(params)}" if params else f"{FILL_URL}{suffix}"


def refused(request: httpx.Request) -> httpx.Response:
    raise httpx.ConnectError("refused", request=request)


class FillRouteCase(ResultsFolder):
    def setUp(self) -> None:
        super().setUp()
        # For the whole test: the worker opens its client after the start request has answered.
        comfy = patch("image_fill_jobs.open_comfy_client", lambda _t: mock_comfy_client(refused))
        comfy.start()
        self.addCleanup(comfy.stop)
        with image_fill_jobs._lock:
            image_fill_jobs._operations.clear()
        self.folder = TempMediaFolder()
        self.root = self.folder.__enter__()
        self.addCleanup(self.folder.__exit__, None, None, None)
        self.media = self.root / "scene.png"
        Image.new("RGB", (40, 20), (10, 20, 30)).save(self.media)

    def body(self, **changes) -> dict:
        return {
            "mask_png": mask_png(painted((40, 20), (5, 5, 15, 15))),
            "preset": "quality",
            **changes,
        }


class StartTests(FillRouteCase):
    def test_a_mask_of_the_wrong_size_is_a_400(self) -> None:
        body = self.body(mask_png=mask_png(painted((20, 40), (5, 5, 15, 15))))

        response = client.post(url(path=str(self.media)), json=body)

        self.assertEqual(response.status_code, 400)
        self.assertIn("20 x 40", response.json()["detail"])

    def test_a_busy_file_is_a_409_media_busy(self) -> None:
        with claimed_elsewhere(self.media):
            response = client.post(url(path=str(self.media)), json=self.body())

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "media_busy")

    def test_a_missing_parent_fill_is_a_409_fill_unavailable(self) -> None:
        stale = make_fill(FillBox(left=0, top=0, width=4, height=4), digest=file_digest(self.media))

        response = client.post(
            url(path=str(self.media)), json=self.body(fills=[stale.model_dump()])
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "fill_unavailable")

    def test_a_video_cannot_be_filled(self) -> None:
        clip = self.root / "clip.mp4"
        clip.write_bytes(b"\x00")

        response = client.post(url(path=str(clip)), json=self.body())

        self.assertEqual(response.status_code, 400)

    def test_an_accepted_start_reports_its_operation(self) -> None:
        response = client.post(url(path=str(self.media)), json=self.body())

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["path"], str(self.media))
        self.assertEqual(payload["preset"], "quality")
        self.assertRegex(payload["id"], r"^[0-9a-f]{32}$")
        for _ in range(500):
            state = client.get(url("/operation", id=payload["id"])).json()
            if state["status"] == "failed":
                break
        self.assertEqual(state["status"], "failed")
        self.assertIn("not reachable", state["error"])


class OperationTests(FillRouteCase):
    def test_an_unknown_operation_is_a_404_that_explains_a_restart(self) -> None:
        for response in (
            client.get(url("/operation", id="f" * 32)),
            client.post(url("/operation/cancel", id="f" * 32)),
        ):
            self.assertEqual(response.status_code, 404)
            self.assertIn("restarted", response.json()["detail"])


class PresetTests(FillRouteCase):
    def test_presets_report_their_availability(self) -> None:
        with patch(
            "routes.media.open_comfy_client",
            lambda _timeout: mock_comfy_client(object_info(models=DEFAULT_MODELS)),
        ):
            response = client.get(url("/presets"))

        self.assertEqual(response.status_code, 200)
        states = {state["preset"]: state for state in response.json()["presets"]}
        self.assertEqual(set(states), {"fast", "quality"})
        self.assertTrue(states["quality"]["available"])


class PreviewTests(FillRouteCase):
    def test_the_preview_is_the_original_with_the_fills_composited(self) -> None:
        asset = solid_asset(
            make_fill(FillBox(left=0, top=0, width=10, height=20), digest=file_digest(self.media))
        )
        save_result(self.media, asset)

        response = client.get(url("/preview", path=str(self.media), fills=asset.fill.id))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "image/png")
        with Image.open(io.BytesIO(response.content)) as preview:
            self.assertEqual(preview.size, (40, 20))
            self.assertEqual(preview.convert("RGB").getpixel((5, 5)), (255, 0, 255))
            self.assertEqual(preview.convert("RGB").getpixel((30, 5)), (10, 20, 30))

    def test_no_fills_is_the_original(self) -> None:
        response = client.get(url("/preview", path=str(self.media)))

        with Image.open(io.BytesIO(response.content)) as preview:
            self.assertEqual(preview.convert("RGB").getpixel((5, 5)), (10, 20, 30))

    def test_ids_that_are_not_fill_ids_are_a_400(self) -> None:
        for fills in ("../../etc", "a" * 31, ",".join(["a" * 32] * 17)):
            response = client.get(url("/preview", path=str(self.media), fills=fills))
            self.assertEqual(response.status_code, 400, fills)

    def test_a_result_made_for_another_file_is_not_served(self) -> None:
        other = self.root / "other.png"
        Image.new("RGB", (40, 20)).save(other)
        asset = solid_asset(
            make_fill(FillBox(left=0, top=0, width=10, height=20), digest=file_digest(other))
        )
        save_result(other, asset)

        response = client.get(url("/preview", path=str(self.media), fills=asset.fill.id))

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "fill_unavailable")


class DiscardTests(FillRouteCase):
    def test_discard_drops_the_unkept_result(self) -> None:
        asset = solid_asset(
            make_fill(FillBox(left=0, top=0, width=10, height=20), digest=file_digest(self.media))
        )
        save_result(self.media, asset)

        response = client.post(url("/discard", path=str(self.media), id=asset.fill.id))

        self.assertEqual(response.status_code, 204)
        self.assertFalse((self.results / asset.fill.id).exists())

    def test_a_path_shaped_id_is_refused(self) -> None:
        response = client.post(f"{FILL_URL}/discard?path={quote(str(self.media))}&id=..%2F..")

        self.assertEqual(response.status_code, 400)
        self.assertTrue(Path(self.results).exists())


if __name__ == "__main__":
    unittest.main()
