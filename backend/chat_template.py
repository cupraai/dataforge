"""Which reasoning-effort levels a model's chat template accepts, found by rendering it.

Templates disagree: one raises on levels it lacks, one maps a level onto another, one never reads
the value at all. Rendering a one-message prompt with each level answers all three alike.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from functools import lru_cache
from typing import Any, get_args

from jinja2 import TemplateError, meta, nodes
from jinja2.ext import Extension
from jinja2.parser import Parser
from jinja2.sandbox import ImmutableSandboxedEnvironment

from schemas import ReasoningEffort

logger = logging.getLogger(__name__)

#: Weakest first; ranks decide the nearest level a template accepts.
REASONING_EFFORTS: tuple[ReasoningEffort, ...] = get_args(ReasoningEffort.__value__)

_SAMPLE_MESSAGES = ({"role": "user", "content": "Describe the image."},)


class _TemplateRaised(Exception):
    pass


class _GenerationTag(Extension):
    """Transformers' ``{% generation %}`` marks assistant text for training; it renders as is."""

    tags = {"generation"}  # noqa: RUF012 - jinja2 declares it a plain set

    def parse(self, parser: Parser) -> nodes.Node:
        lineno = next(parser.stream).lineno
        body = parser.parse_statements(("name:endgeneration",), drop_needle=True)
        return nodes.Scope(body, lineno=lineno)


def _raise_exception(message: str) -> None:
    raise _TemplateRaised(message)


def _strftime_now(pattern: str) -> str:
    return datetime.now().strftime(pattern)


def _tojson(value: Any, ensure_ascii: bool = False, indent: int | None = None, **_: Any) -> str:
    return json.dumps(value, ensure_ascii=ensure_ascii, indent=indent)


def _environment() -> ImmutableSandboxedEnvironment:
    # The same setup transformers and llama.cpp give chat templates.
    env = ImmutableSandboxedEnvironment(
        trim_blocks=True,
        lstrip_blocks=True,
        extensions=["jinja2.ext.loopcontrols", _GenerationTag],
    )
    env.filters["tojson"] = _tojson
    return env


@lru_cache(maxsize=8)
def template_efforts(template: str) -> tuple[ReasoningEffort, ...] | None:
    """Accepted levels, weakest first; ``()`` when the level changes nothing; ``None`` if unknown.

    Levels that render the same prompt are one level, named by the strongest of them, so an alias
    such as Qwen3.8's ``high`` for ``xhigh`` is not offered twice.
    """
    env = _environment()
    try:
        parsed = env.parse(template)
        compiled = env.from_string(template)
    except TemplateError as exc:
        logger.info("Could not read the chat template: %s", exc)
        return None
    if "reasoning_effort" not in meta.find_undeclared_variables(parsed):
        return ()

    def render(**extra: object) -> str:
        return compiled.render(
            messages=list(_SAMPLE_MESSAGES),
            add_generation_prompt=True,
            enable_thinking=True,
            bos_token="",
            eos_token="",
            raise_exception=_raise_exception,
            strftime_now=_strftime_now,
            **extra,
        )

    try:
        render()
    except Exception as exc:
        # The template needs something this sample lacks, so a failing level would prove nothing.
        logger.info("Could not render the chat template: %s", exc)
        return None

    by_prompt: dict[str, ReasoningEffort] = {}
    for effort in REASONING_EFFORTS:
        try:
            by_prompt[render(reasoning_effort=effort)] = effort
        except Exception:
            continue
    distinct = sorted(by_prompt.values(), key=REASONING_EFFORTS.index)
    return tuple(distinct) if len(distinct) > 1 else ()


def nearest_effort(effort: str, supported: tuple[str, ...]) -> str:
    """The supported level closest in rank to ``effort``; ties go to the stronger level."""
    if effort in supported or not supported or effort not in REASONING_EFFORTS:
        return effort
    rank = REASONING_EFFORTS.index(effort)
    return min(
        supported,
        key=lambda level: (
            abs(REASONING_EFFORTS.index(level) - rank),
            -REASONING_EFFORTS.index(level),
        ),
    )
