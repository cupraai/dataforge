"""Create showcase: items with their own prompts and LoRAs, each run with the LoRA showcased.

Several showcased LoRAs compare them: every item renders once per LoRA with one seed, so only
the LoRA differs. Results are numbered like Generate's, and can be laid out on a sheet.
"""

from __future__ import annotations

import secrets
from dataclasses import replace
from pathlib import Path
from typing import Any

import httpx

from automation.comfy_generator import (
    PROCESSED_STAT_KEYS,
    SEED_LIMIT,
    GenerationRun,
    Generator,
    caption_text_for,
)
from automation.job_runner import CANCELLED, ProgressCallback, ShouldCancel
from automation.showcase_plan import (
    ShowcaseEntry,
    ShowcasePlan,
    plan_showcase,
    showcase_grid,
)
from automation.showcase_sheet import make_showcase_sheet
from comfy_loras import describe_lora
from external.comfy_client import (
    COMFY_TRANSFER_TIMEOUT_SECONDS,
    ComfyError,
    ComfyUnavailableError,
    fetch_lora_names,
    fetch_node_info,
    open_comfy_client,
    upload_media,
)
from external.comfy_lora_chain import LoraRef, known_model_output, model_output_index
from external.comfy_sourceless import without_source
from external.comfy_workflows import (
    MODEL_NODE_TITLE,
    ComfyWorkflow,
    ComfyWorkflowError,
    showcase_seed_nodes,
)
from ffmpeg_run import FfmpegCancelled
from numbered_files import NameConflict, sweep_temporary_files

#: Counted apart from the generations, all of which are kept.
SHEET_ERROR = "sheet_error"


def _model_outputs(client: httpx.Client, workflow: ComfyWorkflow) -> dict[str, int]:
    """Only a titled class DataForge does not know needs asking."""
    outputs: dict[str, int] = {}
    for node_id in workflow.model_nodes:
        if known_model_output(workflow, node_id) is not None:
            continue
        class_type = workflow.prompt[node_id]["class_type"]
        index = model_output_index(fetch_node_info(client, class_type))
        if index is None:
            raise ValueError(
                f"ComfyUI lists no model output for {class_type}, the node titled "
                f'"{MODEL_NODE_TITLE}". Title the model loader itself instead.'
            )
        outputs[node_id] = index
    return outputs


def _bare_workflow(
    client: httpx.Client, plan: ShowcasePlan, workflow: ComfyWorkflow
) -> ComfyWorkflow | None:
    """Only for items that leave out the file their preset loads."""
    bare = next((entry for entry in plan.entries if entry.source is None), None)
    if workflow.generates or bare is None:
        return None

    infos: dict[str, dict[str, Any] | None] = {}

    def node_info(class_type: str) -> dict[str, Any] | None:
        if class_type not in infos:
            infos[class_type] = fetch_node_info(client, class_type)
        return infos[class_type]

    try:
        return without_source(workflow, node_info)
    except ComfyWorkflowError as exc:
        kind = workflow.source_kind or "image"
        raise ValueError(
            f"Item {bare.number} has no start {kind}, and {exc} Choose one, or turn the item off."
        ) from exc


class _ShowcaseRun:
    """One showcase job: what it has made so far, and how it is told."""

    def __init__(
        self,
        folder: Path,
        plan: ShowcasePlan,
        on_progress: ProgressCallback | None,
        should_cancel: ShouldCancel | None,
    ) -> None:
        self.folder = folder
        self.plan = plan
        self.on_progress = on_progress
        self.should_cancel = should_cancel
        self.workflow = replace(plan.workflow, seed_nodes=showcase_seed_nodes(plan.workflow))
        self.generator = Generator(
            folder, self.workflow, prefix=plan.prefix, should_cancel=should_cancel
        )
        self.stats: dict[str, int] = {"total": plan.total}
        self.results: list[dict[str, object]] = []
        #: What the sheet shows, by item number and LoRA.
        self.made: dict[tuple[int, str], Path] = {}
        self.done = 0
        #: ComfyUI's names for the start files sent; items may share one.
        self.uploaded: dict[Path, str] = {}
        # Both settled by ``prepare``.
        self.model_outputs: dict[str, int] = {}
        #: What an item without a start file runs; None when no item leaves its file out.
        self.bare_workflow: ComfyWorkflow | None = None

    def cancelled(self) -> bool:
        return self.should_cancel is not None and self.should_cancel()

    def report(self, name: str) -> None:
        if self.on_progress:
            self.on_progress(str(self.folder), name, self.done, self.plan.total, dict(self.stats))

    def title(self, entry: ShowcaseEntry) -> str:
        return f"Item {entry.number}: {entry.label}"

    def fail(self, status: str, entry: ShowcaseEntry, subject: str, message: object) -> None:
        self.done += 1
        self.stats[status] = self.stats.get(status, 0) + 1
        name = f"Item {entry.number}"
        if self.plan.compares:
            name = f"{name} with {describe_lora(subject).stem}"
        self.results.append(self.generator.failure_row(self.done, name, status, message))

    def generation(
        self,
        entry: ShowcaseEntry,
        subject: str,
        *,
        seed: int | None = None,
        media_ref: str | None = None,
    ) -> GenerationRun:
        prompt_text = entry.item.prompt_text.strip()
        return GenerationRun(
            prompt_text=prompt_text,
            custom_values=entry.custom_values,
            caption_text=(
                caption_text_for(self.workflow, prompt_text)
                if self.plan.caption_from_prompt
                else None
            ),
            seed=seed,
            media_ref=media_ref,
            loras=(LoraRef(subject, entry.item.subject_strength), *entry.extras),
            model_outputs=self.model_outputs,
            workflow=self.bare_workflow if entry.source is None else None,
        )

    def prepare(self, client: httpx.Client) -> None:
        """Fails the job before anything is sent, rather than every run the same way."""
        try:
            names = fetch_lora_names(client)
            self.model_outputs = _model_outputs(client, self.workflow)
            self.bare_workflow = _bare_workflow(client, self.plan, self.workflow)
        except ComfyUnavailableError as exc:
            raise ValueError(f"ComfyUI is not reachable: {exc}") from exc

        missing = [] if names is None else sorted(self.plan.lora_names() - set(names))
        if missing:
            raise ValueError(
                f'ComfyUI has no LoRA named "{missing[0]}". Copy it into ComfyUI\'s models/loras '
                "folder, or choose another."
            )

        first = self.plan.entries[0]
        media_ref = None if first.source is None else first.source.name
        try:
            self.generator.build_prompt(
                0, self.generation(first, self.plan.subjects[0], media_ref=media_ref)
            )
        except ComfyWorkflowError as exc:
            raise ValueError(str(exc)) from exc

    def upload(self, client: httpx.Client, entry: ShowcaseEntry) -> str | None:
        if entry.source is None:
            return None
        if entry.source not in self.uploaded:
            tag = f"{self.generator.job_tag}_item{entry.number:03d}"
            self.uploaded[entry.source] = upload_media(
                client, entry.source, name=f"{tag}{entry.source.suffix.lower()}"
            )
        return self.uploaded[entry.source]

    def render_item(self, client: httpx.Client, entry: ShowcaseEntry) -> bool:
        """The item once per LoRA; False when cancelled before all of them ran."""
        if self.cancelled():
            return False

        try:
            media_ref = self.upload(client, entry)
        except ComfyError as exc:
            for subject in self.plan.subjects:
                self.fail("comfy_error", entry, subject, f"The start file was not uploaded: {exc}")
            self.report(self.title(entry))
            return True

        seed: int | None = None
        if self.workflow.seed_nodes:
            # Drawn once, so every LoRA compared gets it.
            seed = entry.item.seed
            if seed is None:
                seed = secrets.randbelow(SEED_LIMIT)
        for subject in self.plan.subjects:
            if self.cancelled() or not self.render(client, entry, subject, seed, media_ref):
                return False
        return True

    def render(
        self,
        client: httpx.Client,
        entry: ShowcaseEntry,
        subject: str,
        seed: int | None,
        media_ref: str | None,
    ) -> bool:
        """One generation; False when it was cancelled."""
        stem = describe_lora(subject).stem
        title = self.title(entry)
        self.report(f"{title} with {stem}" if self.plan.compares else title)
        outcome = self.generator.attempt(
            client,
            self.done + 1,
            self.generation(entry, subject, seed=seed, media_ref=media_ref),
        )

        note = " · ".join([entry.label, stem, *([] if seed is None else [f"Seed {seed}"])])
        self.results.extend(self.generator.success_row(path, [note]) for path in outcome.written)
        if outcome.written:
            # A workflow that saves a batch is shown by its first file.
            self.made[entry.number, subject] = outcome.written[0]
        if outcome.status == CANCELLED:
            return False

        if outcome.status == "success":
            self.done += 1
            self.stats["success"] = self.stats.get("success", 0) + 1
        else:
            self.fail(outcome.status, entry, subject, outcome.message)
        self.report(title)
        return True

    def make_sheet(self) -> None:
        self.report("Showcase sheet")
        try:
            sheet = make_showcase_sheet(
                self.folder,
                f"{self.plan.prefix}_sheet",
                showcase_grid(self.plan, self.made),
                should_cancel=self.should_cancel,
                report=self.report,
            )
        except FfmpegCancelled:
            # Everything the showcase renders is done; the job itself ends cancelled.
            return
        except (OSError, RuntimeError, ValueError, NameConflict) as exc:
            self.stats[SHEET_ERROR] = 1
            self.results.append(
                self.generator.failure_row(self.done + 1, "Showcase sheet", SHEET_ERROR, exc)
            )
            return
        self.results.insert(0, self.generator.success_row(sheet, ["Showcase sheet"]))

    def run(self) -> None:
        client = open_comfy_client(COMFY_TRANSFER_TIMEOUT_SECONDS)
        try:
            self.prepare(client)
            for entry in self.plan.entries:
                if not self.render_item(client, entry):
                    self.stats[CANCELLED] = self.plan.total - self.done
                    return
        finally:
            client.close()

        if self.plan.make_sheet and self.made:
            self.make_sheet()


def run_comfy_showcase_job(
    folder: Path,
    *,
    on_progress: ProgressCallback | None = None,
    should_cancel: ShouldCancel | None = None,
    selected_paths: list[Path] | None = None,
    **params: object,
) -> dict[str, object]:
    del selected_paths
    # The preset or a start file may have changed while queued.
    plan = plan_showcase(folder, **params)
    sweep_temporary_files(folder)

    showcase = _ShowcaseRun(folder, plan, on_progress, should_cancel)
    showcase.run()
    stats = showcase.stats
    return {
        "folder": str(folder),
        "total": plan.total,
        "processed": sum(stats.get(key, 0) for key in PROCESSED_STAT_KEYS),
        "stats": stats,
        "results": showcase.results,
    }
