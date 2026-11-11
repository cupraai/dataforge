import { JOB_GROUPS } from "@/features/jobs/lib/jobMeta";
import type { JobSettingsByType } from "@/features/automation/preferences/automationPreferences";
import { MAX_WORKFLOW_STEPS } from "@/shared/constants";
import type { JobType, Workflow, WorkflowStep } from "@/shared/types";

export type WorkflowJobType = WorkflowStep["job_type"];

/** LoRA training's run name is a per-run resume key, and it ignores the scope. */
const NOT_A_STEP: ReadonlySet<JobType> = new Set<JobType>(["train_lora"]);

export function isWorkflowJobType(type: JobType): type is WorkflowJobType {
  return !NOT_A_STEP.has(type);
}

/** The step picker's sections, in Tools menu order. */
export const WORKFLOW_STEP_GROUPS = JOB_GROUPS.map((group) => ({
  label: group.label,
  types: group.types.filter(isWorkflowJobType),
})).filter((group) => group.types.length > 0);

/** Steps with nothing to set are added as they are, without opening a dialog. */
const SETTINGLESS: ReadonlySet<WorkflowJobType> = new Set<WorkflowJobType>([
  "strip_metadata",
  "check_caption_rules",
  "restore_captions",
  "backup_captions",
]);

export function stepHasSettings(type: WorkflowJobType): boolean {
  return !SETTINGLESS.has(type);
}

/** A dialog's start body, minus the paths a run supplies, as the step it configures. */
export function stepFromBody(type: WorkflowJobType, body: unknown): WorkflowStep {
  const settings = body && typeof body === "object" ? { ...body } : {};
  delete (settings as { paths?: unknown }).paths;
  return { job_type: type, settings } as WorkflowStep;
}

export function emptyStep(type: WorkflowJobType): WorkflowStep {
  return { job_type: type, settings: {} } as WorkflowStep;
}

/** What the step's dialog opens with. ComfyUI's dialog reads its settings per preset. */
export function stepDialogSettings(step: WorkflowStep): unknown {
  if (step.job_type !== "comfy_process") return step.settings;
  const { preset, seed, prompt_text, inputs, overwrite_candidates } = step.settings;
  const comfy: JobSettingsByType["comfy_process"] = {
    preset,
    overwrite_candidates,
    by_preset: preset ? { [preset]: { seed, prompt_text, inputs } } : {},
  };
  return comfy;
}

/** Why no step can be added after `steps` (new steps go last), or null when one can. */
export function addStepBlock(steps: readonly WorkflowStep[]): string | null {
  if (steps.length >= MAX_WORKFLOW_STEPS)
    return `A workflow holds at most ${MAX_WORKFLOW_STEPS} steps`;
  if (steps.some((step) => step.job_type === "batch_rename")) return "Nothing can follow Rename";
  return null;
}

/** Why the steps cannot be saved as they are, or null. */
export function workflowStepsProblem(steps: readonly WorkflowStep[]): string | null {
  if (steps.length === 0) return "Add at least one step";
  if (steps.length > MAX_WORKFLOW_STEPS)
    return `A workflow holds at most ${MAX_WORKFLOW_STEPS} steps`;
  if (steps.slice(0, -1).some((step) => step.job_type === "batch_rename")) {
    return "Rename must be the last step";
  }
  return null;
}

/** `steps` with the step at `from` moved to `to`. */
export function moveStep<T>(steps: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= steps.length || from === to) return [...steps];
  const next = [...steps];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function sameWorkflow(a: Workflow, b: Workflow): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
