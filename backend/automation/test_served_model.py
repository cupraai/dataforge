from __future__ import annotations

import unittest

import httpx
from openai import OpenAI

from automation.served_model import ServedModel, read_served_model, resolve_reasoning_effort
from chat_template import template_efforts

LEVELED = (
    "{% if reasoning_effort is defined and reasoning_effort not in ('low', 'xhigh') %}"
    "{{ raise_exception('unsupported') }}{% endif %}"
    "{% for m in messages %}{{ m.content }}{% endfor %}{{ reasoning_effort }}"
)
LEVEL_FREE = "{% for m in messages %}{{ m.content }}{% endfor %}"


def _client(
    models: list[dict],
    *,
    template: str | None = LEVELED,
    seen: list[httpx.Request] | None = None,
) -> OpenAI:
    def handle(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(request)
        if request.url.path == "/v1/models":
            return httpx.Response(200, json={"object": "list", "data": models})
        if request.url.path == "/props" and template is not None:
            return httpx.Response(200, json={"chat_template": template})
        return httpx.Response(404, json={"error": "not found"})

    return OpenAI(
        base_url="http://127.0.0.1:8888/v1",
        api_key="test-key",
        max_retries=0,
        http_client=httpx.Client(transport=httpx.MockTransport(handle)),
    )


def _model(model_id: str, **extra: object) -> dict:
    return {"id": model_id, "object": "model", "owned_by": "llamacpp", **extra}


class ReadServedModelTests(unittest.TestCase):
    def setUp(self) -> None:
        template_efforts.cache_clear()

    def test_a_single_model_server_names_its_model_whatever_id_is_configured(self) -> None:
        seen: list[httpx.Request] = []
        client = _client([_model("Qwen3.8-27B-UD-Q4_K_XL.gguf")], seen=seen)

        served = read_served_model(client, "qwen38")

        self.assertEqual(served, ServedModel("Qwen3.8-27B-UD-Q4_K_XL.gguf", ("low", "xhigh")))
        props = seen[-1]
        self.assertEqual(props.url.path, "/props")
        self.assertEqual(props.headers["Authorization"], "Bearer test-key")
        self.assertNotIn("model", props.url.params)

    def test_a_template_without_levels_reports_none(self) -> None:
        served = read_served_model(_client([_model("gemma")], template=LEVEL_FREE), "gemma")

        self.assertEqual(served, ServedModel("gemma", ()))

    def test_a_router_reads_the_configured_loaded_model(self) -> None:
        seen: list[httpx.Request] = []
        models = [
            _model("a", status={"value": "loaded"}),
            _model("b", status={"value": "loaded"}),
        ]

        served = read_served_model(_client(models, seen=seen), "b")

        self.assertEqual(served, ServedModel("b", ("low", "xhigh")))
        self.assertEqual(seen[-1].url.params["model"], "b")

    def test_an_unloaded_router_model_is_not_loaded_just_to_read_its_template(self) -> None:
        seen: list[httpx.Request] = []
        models = [_model("a", status={"value": "unloaded"}), _model("b")]

        served = read_served_model(_client(models, seen=seen), "a")

        self.assertEqual(served, ServedModel("a"))
        self.assertEqual([request.url.path for request in seen], ["/v1/models"])

    def test_an_unknown_id_among_several_models_names_none(self) -> None:
        served = read_served_model(_client([_model("a"), _model("b")]), "c")

        self.assertEqual(served, ServedModel(problem="The server has no single loaded model"))

    def test_a_catalog_of_downloads_names_its_one_loaded_model(self) -> None:
        # Unsloth Studio lists every downloaded model and flags the resident one.
        models = [_model("inkling", loaded=False), _model("qwen3.8", loaded=True)]

        served = read_served_model(_client(models), "qwen38")

        self.assertEqual(served, ServedModel("qwen3.8", ("low", "xhigh")))

    def test_a_configured_catalog_model_that_is_not_loaded_has_unknown_levels(self) -> None:
        # The server's template belongs to the resident model, not the one a request would load.
        seen: list[httpx.Request] = []
        models = [_model("inkling", loaded=False), _model("qwen3.8", loaded=True)]

        served = read_served_model(_client(models, seen=seen), "inkling")

        self.assertEqual(served, ServedModel("inkling"))
        self.assertEqual([request.url.path for request in seen], ["/v1/models"])

    def test_a_refused_key_is_reported(self) -> None:
        def refuse(request: httpx.Request) -> httpx.Response:
            return httpx.Response(401, json={"error": {"message": "Invalid token payload"}})

        client = OpenAI(
            base_url="http://127.0.0.1:8888/v1",
            api_key="k",
            max_retries=0,
            http_client=httpx.Client(transport=httpx.MockTransport(refuse)),
        )

        served = read_served_model(client, "x")

        self.assertEqual(served, ServedModel(problem="The server refused the API key"))

    def test_a_server_without_props_leaves_the_levels_unknown(self) -> None:
        served = read_served_model(_client([_model("vllm-model")], template=None), "x")

        self.assertEqual(served, ServedModel("vllm-model"))

    def test_an_unreachable_server_knows_nothing(self) -> None:
        def refuse(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("refused", request=request)

        client = OpenAI(
            base_url="http://127.0.0.1:8888/v1",
            api_key="k",
            max_retries=0,
            http_client=httpx.Client(transport=httpx.MockTransport(refuse)),
        )

        self.assertEqual(
            read_served_model(client, "x"),
            ServedModel(problem="The server did not answer", reachable=False),
        )


class ResolveReasoningEffortTests(unittest.TestCase):
    def setUp(self) -> None:
        template_efforts.cache_clear()

    def _resolve(self, effort: str, client: OpenAI, mode: str = "thinking") -> str | None:
        return resolve_reasoning_effort(client, effort, mode=mode, model="m")

    def test_an_unsupported_level_becomes_the_nearest_supported_one(self) -> None:
        client = _client([_model("m")])

        self.assertEqual(self._resolve("max", client), "xhigh")
        self.assertEqual(self._resolve("low", client), "low")

    def test_no_level_is_sent_to_a_template_that_reads_none(self) -> None:
        self.assertIsNone(self._resolve("medium", _client([_model("m")], template=LEVEL_FREE)))

    def test_an_unknown_template_gets_the_chosen_level(self) -> None:
        self.assertEqual(self._resolve("max", _client([_model("m")], template=None)), "max")

    def test_instruct_does_not_ask_the_server(self) -> None:
        seen: list[httpx.Request] = []

        self.assertEqual(self._resolve("max", _client([], seen=seen), mode="instruct"), "max")
        self.assertEqual(seen, [])


if __name__ == "__main__":
    unittest.main()
