"""What a showcase will run: its items checked, and where each result sits on the sheet."""

from __future__ import annotations

import math
from collections import Counter
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from automation.comfy_generator import (
    name_prefix_for,
    refuse_staging_folder,
    validate_name_prefix,
)
from automation.showcase_sheet import SheetCell, SheetGrid
from comfy_loras import describe_lora, label_compared_loras
from constants import (
    IMAGE_EXTENSIONS,
    MAX_SHEET_CELLS,
    MAX_SHOWCASE_GENERATIONS,
    MOTION_EXTENSIONS,
)
from external.comfy_lora_chain import LoraRef, require_model_nodes
from external.comfy_workflows import (
    PROMPT_NODE_TITLE,
    ComfyWorkflow,
    ComfyWorkflowError,
    load_comfy_workflow,
    resolve_custom_inputs,
)
from filesystem import normalize_user_path
from schemas import ComfyInputValue, ComfyShowcaseItem, ComfyShowcaseJobSettings

#: As the gallery tells them apart; one the loader cannot read fails with ComfyUI's own error.
_SOURCE_EXTENSIONS = {"image": IMAGE_EXTENSIONS, "video": MOTION_EXTENSIONS}

#: A label falls back to the prompt's first line, cut to this.
LABEL_EXCERPT_LENGTH = 40


def item_label(item: ComfyShowcaseItem, number: int) -> str:
    """The frontend's ``showcaseItemTitle`` mirrors this."""
    label = item.label.strip()
    if label:
        return label
    line = next((line.strip() for line in item.prompt_text.splitlines() if line.strip()), "")
    if not line:
        return f"Item {number}"
    if len(line) <= LABEL_EXCERPT_LENGTH:
        return line
    return f"{line[: LABEL_EXCERPT_LENGTH - 1].rstrip()}…"


@dataclass(frozen=True)
class ShowcaseEntry:
    #: 1-based position in the whole list, turned-off items counted.
    number: int
    item: ComfyShowcaseItem
    label: str
    custom_values: dict[str, ComfyInputValue]
    #: None runs the preset without its source loader.
    source: Path | None
    #: The item's own LoRAs that are on, after the one showcased.
    extras: tuple[LoraRef, ...]


@dataclass(frozen=True)
class ShowcasePlan:
    workflow: ComfyWorkflow
    subjects: tuple[str, ...]
    entries: tuple[ShowcaseEntry, ...]
    prefix: str
    caption_from_prompt: bool
    make_sheet: bool

    @property
    def total(self) -> int:
        return len(self.entries) * len(self.subjects)

    @property
    def compares(self) -> bool:
        return len(self.subjects) > 1

    def lora_names(self) -> set[str]:
        return {*self.subjects, *(lora.name for entry in self.entries for lora in entry.extras)}


def _item_source(workflow: ComfyWorkflow, item: ComfyShowcaseItem, where: str) -> Path | None:
    raw = (item.source_path or "").strip()
    if workflow.generates:
        if raw:
            raise ValueError(
                f'{where} has a start file, but the preset "{workflow.preset}" loads none. Clear '
                "it, or choose a preset with a source loader."
            )
        return None

    if not raw:
        # Whether the preset can run without one takes ComfyUI to say.
        return None
    kind = workflow.source_kind or "image"
    path = normalize_user_path(raw)
    if not path.is_file():
        raise ValueError(f"{where}: its start file {path.name} is no longer there.")
    if path.suffix.lower() not in _SOURCE_EXTENSIONS[kind]:
        noun = "an image" if kind == "image" else "a video"
        raise ValueError(
            f'{where}: {path.name} is not {noun}, and the preset "{workflow.preset}" loads one.'
        )
    return path


def _item_extras(
    item: ComfyShowcaseItem, subjects: tuple[str, ...], where: str
) -> tuple[LoraRef, ...]:
    extras = tuple(LoraRef(lora.name.strip(), lora.strength) for lora in item.loras if lora.enabled)
    names = [lora.name for lora in extras]
    if any(not name for name in names):
        raise ValueError(f"{where} has a LoRA row with no LoRA chosen.")
    if len(set(names)) != len(names):
        raise ValueError(f"{where} loads one LoRA twice.")
    for subject in subjects:
        if subject in names:
            raise ValueError(
                f"{where} already loads {describe_lora(subject).stem}, the LoRA being showcased. "
                "Remove it from the item."
            )
    return extras


def _plan_entry(
    workflow: ComfyWorkflow,
    settings: ComfyShowcaseJobSettings,
    item: ComfyShowcaseItem,
    number: int,
    subjects: tuple[str, ...],
) -> ShowcaseEntry:
    where = f"Item {number}"
    if item.prompt_text.strip() and workflow.prompt_node is None:
        raise ValueError(
            f'{where} has a prompt, but the preset "{workflow.preset}" has no node titled '
            f'"{PROMPT_NODE_TITLE}" to put it in. Title one in ComfyUI and re-export it, or '
            "clear the prompt."
        )
    try:
        values = resolve_custom_inputs(workflow, {**settings.inputs, **item.inputs})
    except ComfyWorkflowError as exc:
        raise ValueError(f"{where}: {exc}") from exc
    return ShowcaseEntry(
        number=number,
        item=item,
        label=item_label(item, number),
        custom_values=values,
        source=_item_source(workflow, item, where),
        extras=_item_extras(item, subjects, where),
    )


def _subjects(settings: ComfyShowcaseJobSettings) -> tuple[str, ...]:
    subjects = tuple(name.strip() for name in settings.subject_loras)
    if not subjects or not all(subjects):
        raise ValueError("Choose the LoRA to showcase.")
    if len(set(subjects)) != len(subjects):
        raise ValueError("Each LoRA can be compared once.")
    return subjects


def plan_showcase(folder: Path, **params: object) -> ShowcasePlan:
    """Refuse at queue time what would fail on the first run; does not probe ComfyUI."""
    refuse_staging_folder(folder)
    settings = ComfyShowcaseJobSettings.model_validate(params)

    try:
        workflow = load_comfy_workflow(settings.preset)
        require_model_nodes(workflow)
        resolve_custom_inputs(workflow, settings.inputs)
    except ComfyWorkflowError as exc:
        # ComfyWorkflowError would escape the route as a 500.
        raise ValueError(str(exc)) from exc

    subjects = _subjects(settings)
    entries = tuple(
        _plan_entry(workflow, settings, item, number, subjects)
        for number, item in enumerate(settings.items, start=1)
        if item.enabled
    )
    if not entries:
        raise ValueError("Turn on at least one item to render.")

    prefix = name_prefix_for(settings.preset, settings.name_prefix)
    validate_name_prefix(prefix)
    plan = ShowcasePlan(
        workflow=workflow,
        subjects=subjects,
        entries=entries,
        prefix=prefix,
        caption_from_prompt=settings.caption_from_prompt,
        make_sheet=settings.make_sheet,
    )
    if plan.total > MAX_SHOWCASE_GENERATIONS:
        raise ValueError(
            f"This showcase would run {plan.total} generations; at most "
            f"{MAX_SHOWCASE_GENERATIONS} run at once. Turn off items, or compare fewer LoRAs."
        )
    if plan.make_sheet and plan.total > MAX_SHEET_CELLS:
        raise ValueError(
            f"A sheet holds at most {MAX_SHEET_CELLS} results, and this showcase makes "
            f"{plan.total}. Turn off the sheet or some items, or compare fewer LoRAs."
        )
    return plan


def showcase_grid(plan: ShowcasePlan, made: Mapping[tuple[int, str], Path]) -> SheetGrid:
    """Items down and the LoRAs compared across; a result that failed leaves its place blank.

    With one LoRA there is nothing to compare, so the items fill a square, each labelled.
    ``made`` is keyed by item number and LoRA.
    """
    entries = [
        entry
        for entry in plan.entries
        if any((entry.number, subject) in made for subject in plan.subjects)
    ]
    shared = Counter(entry.label for entry in entries)
    labels = [
        # Prompts that open alike would label every row the same.
        f"Item {entry.number}"
        if shared[entry.label] > 1 and not entry.item.label.strip()
        else entry.label
        for entry in entries
    ]

    if not plan.compares:
        width = math.ceil(math.sqrt(len(entries)))
        return SheetGrid(
            tuple(
                SheetCell(
                    made[entry.number, plan.subjects[0]], index // width, index % width, label
                )
                for index, (entry, label) in enumerate(zip(entries, labels, strict=True))
            )
        )

    columns = label_compared_loras(plan.subjects)
    return SheetGrid(
        cells=tuple(
            SheetCell(made[entry.number, name], row, column)
            for row, entry in enumerate(entries)
            for column, (name, _) in enumerate(columns)
            if (entry.number, name) in made
        ),
        row_labels=tuple(labels),
        column_labels=tuple(label for _, label in columns),
    )
