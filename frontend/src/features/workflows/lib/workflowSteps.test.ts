import { describe, expect, it } from "vitest";
import { JOB_GROUPS } from "@/features/jobs/lib/jobMeta";
import type { WorkflowStep } from "@/shared/types";
import { stepSummary } from "./stepSummary";
import {
  addStepBlock,
  emptyStep,
  isWorkflowJobType,
  moveStep,
  stepDialogSettings,
  stepFromBody,
  WORKFLOW_STEP_GROUPS,
  workflowStepsProblem,
} from "./workflowSteps";

const resize: WorkflowStep = {
  job_type: "resize",
  settings: { megapixels: 1, multiple: 16, frame_rate: 24, reset_size: false },
};
const rename: WorkflowStep = {
  job_type: "batch_rename",
  settings: { stem: "photo", start_number: 1 },
};

describe("workflow steps", () => {
  it("uses the Tools groups with LoRA training excluded", () => {
    expect(WORKFLOW_STEP_GROUPS).toEqual(
      JOB_GROUPS.map(({ label, types }) => ({
        label,
        types: types.filter((type) => type !== "train_lora"),
      })),
    );
    expect(isWorkflowJobType("train_lora")).toBe(false);
  });

  it("stores a dialog's start body without the paths a run supplies", () => {
    const step = stepFromBody("resize", { megapixels: 2, multiple: 32, paths: ["C:\\a.png"] });

    expect(step).toEqual({ job_type: "resize", settings: { megapixels: 2, multiple: 32 } });
  });

  it("opens ComfyUI's dialog with the step's values under its preset", () => {
    const step: WorkflowStep = {
      job_type: "comfy_process",
      settings: {
        preset: "upscale",
        seed: 7,
        prompt_text: "sharp",
        inputs: {},
        overwrite_candidates: true,
      },
    };

    expect(stepDialogSettings(step)).toEqual({
      preset: "upscale",
      overwrite_candidates: true,
      by_preset: { upscale: { seed: 7, prompt_text: "sharp", inputs: {} } },
    });
    expect(stepDialogSettings(resize)).toBe(resize.settings);
  });

  it("keeps Rename last", () => {
    expect(workflowStepsProblem([resize, rename])).toBeNull();
    expect(workflowStepsProblem([rename, resize])).toBe("Rename must be the last step");
    expect(addStepBlock([resize, rename])).toBe("Nothing can follow Rename");
    expect(addStepBlock([resize])).toBeNull();
  });

  it("needs at least one step", () => {
    expect(workflowStepsProblem([])).toBe("Add at least one step");
  });

  it("moves a step and refuses moves out of range", () => {
    const strip = emptyStep("strip_metadata");

    expect(moveStep([resize, strip], 1, 0)).toEqual([strip, resize]);
    expect(moveStep([resize, strip], 0, -1)).toEqual([resize, strip]);
  });
});

describe("stepSummary", () => {
  it("says what each step does with its settings", () => {
    expect(stepSummary(resize)).toBe("1 MP · multiple of 16 · 24 fps");
    expect(stepSummary({ ...resize, settings: { ...resize.settings, reset_size: true } })).toBe(
      "Resets the size",
    );
    expect(stepSummary(emptyStep("strip_metadata"))).toBe("No settings");
    expect(
      stepSummary({
        job_type: "auto_caption",
        settings: {
          mode: "thinking",
          reasoning_effort: "xhigh",
          preserve_thinking: true,
          caption_audio: true,
        },
      }),
    ).toBe("Thinking, extra high effort · with audio");
    expect(
      stepSummary({
        job_type: "split_video",
        settings: {
          mode: "interval",
          sensitivity: "medium",
          interval_seconds: 4,
          longest_seconds: 5,
          shortest_seconds: 1,
          frame_rate: null,
        },
      }),
    ).toBe("Every 4 s · at least 1 s");
  });

  it("shortens long text with an ellipsis", () => {
    const summary = stepSummary({
      job_type: "edit_captions",
      settings: {
        mode: "instruct",
        reasoning_effort: "medium",
        preserve_thinking: true,
        instruction: "Rewrite every caption in the present tense and drop camera jargon entirely.",
        vision: false,
        backup: true,
      },
    });

    expect(summary).toMatch(/^Instruct · "Rewrite every caption in the present te…"$/);
  });
});
