from __future__ import annotations

import unittest

from chat_template import nearest_effort, template_efforts

PROMPT = "{% for m in messages %}<{{ m.role }}>{{ m.content }}{% endfor %}"

# Raises on levels it lacks and maps `high` onto `xhigh`, like Qwen3.8's own template.
STRICT = (
    "{%- set e = reasoning_effort | default('xhigh') %}"
    "{%- if e == 'high' %}{%- set e = 'xhigh' %}{%- endif %}"
    "{%- if e not in ('low', 'medium', 'xhigh') %}"
    "{{- raise_exception('Unexpected reasoning effort ' ~ e) }}"
    "{%- endif %}" + PROMPT + "<effort:{{ e }}>"
)


class TemplateEffortsTests(unittest.TestCase):
    def setUp(self) -> None:
        template_efforts.cache_clear()

    def test_only_the_levels_the_template_renders_are_offered(self) -> None:
        self.assertEqual(template_efforts(STRICT), ("low", "medium", "xhigh"))

    def test_levels_rendering_the_same_prompt_are_named_by_the_strongest(self) -> None:
        template = (
            "{%- set n = {'low': 1, 'medium': 2, 'high': 3, 'xhigh': 4, 'max': 4}"
            "[reasoning_effort | default('high')] %}" + PROMPT + "{{ n }}"
        )

        self.assertEqual(template_efforts(template), ("low", "medium", "high", "max"))

    def test_a_template_that_never_reads_the_level_has_none(self) -> None:
        self.assertEqual(
            template_efforts(PROMPT + "{% if enable_thinking %}<think>{% endif %}"), ()
        )

    def test_a_level_that_changes_nothing_is_not_a_choice(self) -> None:
        template = "{% set unused = reasoning_effort %}" + PROMPT

        self.assertEqual(template_efforts(template), ())

    def test_an_unreadable_template_is_unknown_rather_than_level_free(self) -> None:
        self.assertIsNone(template_efforts("{% if reasoning_effort %}"))
        # Fails without any level, so a failing level would prove nothing.
        self.assertIsNone(template_efforts("{{ reasoning_effort }}{{ raise_exception('no') }}"))

    def test_transformers_generation_blocks_render(self) -> None:
        template = (
            "{% generation %}" + PROMPT + "{% endgeneration %}"
            "{% if reasoning_effort is defined and reasoning_effort not in ('low', 'max') %}"
            "{{ raise_exception('x') }}"
            "{% endif %}{{ reasoning_effort }}{{ strftime_now('%Y') | length }}{{ {} | tojson }}"
        )

        self.assertEqual(template_efforts(template), ("low", "max"))


class NearestEffortTests(unittest.TestCase):
    def test_keeps_a_supported_level(self) -> None:
        self.assertEqual(nearest_effort("medium", ("low", "medium", "xhigh")), "medium")

    def test_picks_the_closest_level_and_the_stronger_one_on_a_tie(self) -> None:
        supported = ("low", "medium", "xhigh")

        self.assertEqual(nearest_effort("high", supported), "xhigh")
        self.assertEqual(nearest_effort("max", supported), "xhigh")
        self.assertEqual(nearest_effort("low", ("medium", "max")), "medium")

    def test_leaves_the_level_alone_without_choices(self) -> None:
        self.assertEqual(nearest_effort("high", ()), "high")


if __name__ == "__main__":
    unittest.main()
