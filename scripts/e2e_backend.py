"""Backend for the browser E2E suite: a throwaway workspace, stand-in services, no real ones.

Started by frontend/playwright.config.ts, never by hand. Reads DATAFORGE_E2E_RUN_DIR, the run's
own folder that frontend/e2e/runDirectory.ts made, and DATAFORGE_API_PORT for where to serve.
"""

from __future__ import annotations

import io
import json
import os
import sys
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import ClassVar
from urllib.parse import parse_qs, unquote, urlsplit

import uvicorn

# Before any backend import: older interpreters die on PEP 695 with a bare SyntaxError.
from py_version import require_python

require_python()

BACKEND = Path(__file__).resolve().parent.parent / "backend"

DEFAULT_API_PORT = 18090

#: Longer than DRAFT_CAPTION_THRESHOLD, or the runner scores it too_short and retries.
CAPTION = (
    "A red hatchback is parked on a gravel driveway beside a low stone wall, with a row of "
    "birch trees standing behind it and a wooden gate left open at the far end. Late "
    "afternoon light rakes across the gravel and throws long shadows toward the camera, and "
    "a bicycle leans against the wall on the left."
)

SYSPROMPT = "# Describe the scene plainly, in one paragraph."

#: Short enough to stay under the threshold that skips a file as already written.
DRAFT = "A parked car."

REQUEST_LOG = "model-requests.json"

#: Every interrupt and queue removal the stand-in ComfyUI received, for the fill spec to read.
COMFY_STOP_LOG = "comfy-stops.json"

#: A fill whose prompt says this never finishes on its own, so the spec can cancel it.
SLOW_FILL_MARKER = "slow"

#: History reads before a fill reports its output, so the editor shows a run in progress.
FILL_POLLS_BEFORE_DONE = 2

#: What the stand-in paints into every fill: unmistakable against any fixture.
FILL_COLOR = (255, 0, 255)

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"

#: Written by frontend/e2e/runDirectory.ts; a folder without it is not this suite's to fill.
OWNER_MARKER = ".dataforge-e2e-owner"

#: What the app reads from the environment. A developer shell's values must not reach the run.
APP_ENV_PREFIXES = ("DATAFORGE_", "OPENAI_", "COMFY_", "OSTRIS_", "VIDEO_", "IMAGE_", "DRAFT_")
#: Set by playwright.config.ts for this run.
RUN_ENV = ("DATAFORGE_API_PORT", "DATAFORGE_UI_PORT", "DATAFORGE_E2E_RUN_DIR")


class ModelHandler(BaseHTTPRequestHandler):
    """The vision model's half of the round trip, recorded so the test can inspect the prompt."""

    workspace: Path

    def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler's spelling
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length) or b"{}")
        self._record(payload)

        body = json.dumps(
            {"choices": [{"message": {"content": CAPTION}, "finish_reason": "stop"}]}
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args: object) -> None:
        return

    def _record(self, payload: dict[str, object]) -> None:
        log = self.workspace / REQUEST_LOG
        recorded = json.loads(log.read_text(encoding="utf-8")) if log.is_file() else []
        recorded.append(payload)
        log.write_text(json.dumps(recorded), encoding="utf-8")


class UnavailableHandler(BaseHTTPRequestHandler):
    """ComfyUI and AI-Toolkit as stopped services: every request fails at once, the same way."""

    def _refuse(self) -> None:
        self.send_response(503)
        self.send_header("Content-Length", "0")
        self.end_headers()

    do_GET = do_POST = do_DELETE = _refuse  # noqa: N815 - BaseHTTPRequestHandler's spelling

    def log_message(self, *_args: object) -> None:
        return


class FillComfyHandler(UnavailableHandler):
    """ComfyUI as far as the editor's fill uses it; everything else stays a stopped service.

    The probe and the prep job's endpoints still answer 503, so only the fill sees a ComfyUI. Every
    node and the default model files exist, and a fill paints its whole crop in ``FILL_COLOR``.
    """

    workspace: Path
    lock = threading.Lock()
    uploads: ClassVar[dict[str, tuple[int, int]]] = {}
    prompts: ClassVar[dict[str, dict[str, object]]] = {}

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler's spelling
        url = urlsplit(self.path)
        if url.path.startswith("/object_info/"):
            class_type = unquote(url.path.removeprefix("/object_info/"))
            self._json({class_type: {"input": {"required": self._loader_options(class_type)}}})
        elif url.path == "/queue":
            with self.lock:
                running = [[0, key, {}] for key, run in self.prompts.items() if not run["done"]]
            self._json({"queue_running": running, "queue_pending": []})
        elif url.path.startswith("/history/"):
            self._json(self._history(url.path.removeprefix("/history/")))
        elif url.path == "/view":
            name = parse_qs(url.query).get("filename", [""])[0]
            self._view(name.removesuffix(".png"))
        else:
            self._refuse()

    def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler's spelling
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        path = urlsplit(self.path).path
        if path == "/upload/image":
            self._upload(body)
        elif path == "/prompt":
            self._prompt(json.loads(body))
        elif path in {"/interrupt", "/queue"}:
            self._stop(path, json.loads(body or b"{}"))
        else:
            self._refuse()

    def _json(self, payload: object) -> None:
        data = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    @staticmethod
    def _loader_options(class_type: str) -> dict[str, object]:
        from app_settings import SETTING_DEFAULTS

        loaders = {
            "UNETLoader": ("unet_name", SETTING_DEFAULTS.fill_diffusion_model),
            "CLIPLoader": ("clip_name", SETTING_DEFAULTS.fill_text_encoder),
            "VAELoader": ("vae_name", SETTING_DEFAULTS.fill_vae),
            "LoraLoaderModelOnly": ("lora_name", SETTING_DEFAULTS.fill_turbo_lora),
        }
        if class_type not in loaders:
            return {}
        key, name = loaders[class_type]
        return {key: [[name], {}]}

    def _upload(self, body: bytes) -> None:
        from PIL import Image

        with Image.open(io.BytesIO(body[body.index(PNG_SIGNATURE) :])) as image:
            size = image.size
        with self.lock:
            name = f"upload_{len(self.uploads) + 1}.png"
            self.uploads[name] = size
        self._json({"name": name, "subfolder": ""})

    def _prompt(self, payload: dict[str, object]) -> None:
        graph = payload["prompt"]
        assert isinstance(graph, dict)
        nodes = {key: node for key, node in graph.items() if isinstance(node, dict)}
        source = next(n for n in nodes.values() if n["class_type"] == "LoadImage")
        text = next(n for n in nodes.values() if n["class_type"] == "TextEncodeQwenImage21")
        output = next(key for key, n in nodes.items() if n["class_type"] == "SaveImage")
        prompt_id = uuid.uuid4().hex
        with self.lock:
            self.prompts[prompt_id] = {
                "size": self.uploads[source["inputs"]["image"]],
                "slow": SLOW_FILL_MARKER in str(text["inputs"]["prompt"]),
                "output": output,
                "polls": 0,
                "done": False,
            }
        self._json({"prompt_id": prompt_id})

    def _history(self, prompt_id: str) -> dict[str, object]:
        with self.lock:
            run = self.prompts.get(prompt_id)
            if run is None or run["slow"] or run["done"]:
                return {}
            run["polls"] = int(run["polls"]) + 1  # type: ignore[call-overload]
            if run["polls"] <= FILL_POLLS_BEFORE_DONE:  # type: ignore[operator]
                return {}
            run["done"] = True
        image = {"filename": f"{prompt_id}.png", "subfolder": "", "type": "output"}
        outputs = {run["output"]: {"images": [image]}}
        return {prompt_id: {"status": {"completed": True}, "outputs": outputs}}

    def _view(self, prompt_id: str) -> None:
        from PIL import Image

        with self.lock:
            run = self.prompts.get(prompt_id)
        if run is None:
            self._refuse()
            return
        buffer = io.BytesIO()
        Image.new("RGB", run["size"], FILL_COLOR).save(buffer, format="PNG")  # type: ignore[arg-type]
        data = buffer.getvalue()
        self.send_response(200)
        self.send_header("Content-Type", "image/png")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _stop(self, path: str, payload: dict[str, object]) -> None:
        with self.lock:
            stopped = payload.get("prompt_id") or payload.get("delete")
            for key in stopped if isinstance(stopped, list) else [stopped]:
                if key in self.prompts:
                    self.prompts[key]["done"] = True
            log = self.workspace / COMFY_STOP_LOG
            recorded = json.loads(log.read_text(encoding="utf-8")) if log.is_file() else []
            recorded.append({"path": path, **payload})
            log.write_text(json.dumps(recorded), encoding="utf-8")
        self._json({})


def serve(handler: type[BaseHTTPRequestHandler]) -> str:
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{server.server_address[1]}"


def isolate_environment(workspace: Path, run_dir: Path) -> None:
    """Every service the app can call answers from this process, whatever runs on the machine."""
    for name in list(os.environ):
        if name.startswith(APP_ENV_PREFIXES) and name not in RUN_ENV:
            del os.environ[name]

    model = type("BoundModelHandler", (ModelHandler,), {"workspace": workspace})
    os.environ["OPENAI_API_BASE_URL"] = f"{serve(model)}/v1"
    os.environ["OPENAI_MODEL"] = "e2e-stand-in"
    unavailable = serve(UnavailableHandler)
    fill_comfy = type("BoundFillComfyHandler", (FillComfyHandler,), {"workspace": workspace})
    os.environ["COMFY_BASE_URL"] = serve(fill_comfy)
    os.environ["OSTRIS_BASE_URL"] = unavailable
    # Inside the run's folder, not backend/data: unkept results belong to this run alone.
    os.environ["DATAFORGE_FILL_RESULTS"] = str(run_dir / "fill-results")
    os.environ["DATAFORGE_THUMBNAIL_CACHE"] = str(run_dir / "thumbnails")
    # The fresh database's default favorite is the real home folder; never tag that.
    os.environ["DATAFORGE_DISABLE_TAGGING"] = "1"


def write_clip(path: Path, *, seconds: int = 2, fps: int = 10, size: int = 64) -> None:
    """Written with the library that reads it back, so a decodable clip needs no ffmpeg."""
    import cv2
    import numpy as np

    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (size, size))
    if not writer.isOpened():
        raise RuntimeError("OpenCV could not open an mp4 writer, so the clip fixture is missing")

    try:
        for index in range(seconds * fps):
            frame = np.full((size, size, 3), index * 4 % 256, dtype=np.uint8)
            frame[:, : size // 2] = (index * 7) % 256
            writer.write(frame)
    finally:
        writer.release()

    capture = cv2.VideoCapture(str(path))
    try:
        readable, _frame = capture.read()
    finally:
        capture.release()

    if not readable:
        raise RuntimeError(f"{path.name} was written but cannot be decoded, so the test is moot")


def build_workspace(workspace: Path) -> None:
    from testing_fixtures import write_media, write_sysprompt, write_txt_caption

    workspace.mkdir()

    write_sysprompt(workspace, SYSPROMPT)
    write_txt_caption(write_media(workspace, "photo.png"), DRAFT)

    clip = workspace / "clip.mp4"
    write_clip(clip)
    write_txt_caption(clip, DRAFT)


def main() -> int:
    os.chdir(BACKEND)
    sys.path.insert(0, str(BACKEND))

    run_dir = Path(os.environ["DATAFORGE_E2E_RUN_DIR"]).resolve()
    if not (run_dir / OWNER_MARKER).is_file():
        raise SystemExit(f"{run_dir} has no {OWNER_MARKER}, so it is not an E2E run folder")
    workspace = run_dir / "workspace"

    # Before importing the app: it reads preferences, and a real .env would point at a real model.
    isolate_environment(workspace, run_dir)
    from testing_fixtures import isolate_test_database

    isolate_test_database()
    build_workspace(workspace)

    from main import app

    port = int(os.environ.get("DATAFORGE_API_PORT", DEFAULT_API_PORT))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
