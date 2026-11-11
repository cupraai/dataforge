import type { AutomationMode, ReasoningEffort, WorkflowStep } from "@/shared/types";

const SUMMARY_TEXT_LIMIT = 40;

function quoted(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const short =
    flat.length > SUMMARY_TEXT_LIMIT ? `${flat.slice(0, SUMMARY_TEXT_LIMIT - 1).trimEnd()}…` : flat;
  return `"${short}"`;
}

function modelMode(mode: AutomationMode, effort: ReasoningEffort): string {
  return mode === "thinking"
    ? `Thinking, ${effort === "xhigh" ? "extra high" : effort} effort`
    : "Instruct";
}

function seconds(value: number): string {
  return `${Number(value.toFixed(2))} s`;
}

function frameRate(rate: number | null | undefined): string | null {
  return rate ? `${rate} fps` : null;
}

function join(parts: Array<string | null | false | undefined>): string {
  return parts.filter(Boolean).join(" · ");
}

/** One line saying what a step will do with its settings, for step cards and the run dialog. */
export function stepSummary(step: WorkflowStep): string {
  switch (step.job_type) {
    case "auto_caption": {
      const s = step.settings;
      return join([modelMode(s.mode, s.reasoning_effort), s.caption_audio && "with audio"]);
    }
    case "set_captions": {
      const s = step.settings;
      return join([
        s.caption ? quoted(s.caption) : "Empty caption",
        s.overwrite ? "replaces existing captions" : "only where missing",
      ]);
    }
    case "replace_captions": {
      const s = step.settings;
      const edit =
        s.mode === "prepend"
          ? `Prepend ${quoted(s.replacement)}`
          : s.mode === "append"
            ? `Append ${quoted(s.replacement)}`
            : `${quoted(s.search)} → ${quoted(s.replacement)}`;
      return join([edit, s.use_regex && "regex", s.case_sensitive && "match case"]);
    }
    case "find_duplicates":
      return `${step.settings.threshold[0].toUpperCase()}${step.settings.threshold.slice(1)} matches`;
    case "batch_rename":
      return `${step.settings.stem || "Unnamed"}, numbered from ${step.settings.start_number}`;
    case "verify_captions": {
      const s = step.settings;
      return join([modelMode(s.mode, s.reasoning_effort), s.context && quoted(s.context)]);
    }
    case "edit_captions": {
      const s = step.settings;
      return join([
        modelMode(s.mode, s.reasoning_effort),
        s.instruction ? quoted(s.instruction) : "No instruction",
        s.vision && "sends media",
      ]);
    }
    case "watermark": {
      const s = step.settings;
      return (
        join([
          s.text_enabled && (s.text ? quoted(s.text) : "Text"),
          s.image_enabled && "Image",
          s.strip_metadata && "strips metadata",
        ]) || "Nothing enabled"
      );
    }
    case "auto_adjust": {
      const s = step.settings;
      if (s.reset_adjustments) return "Resets color adjustments";
      return s.replace_adjustments ? "Replaces earlier adjustments" : "Keeps earlier adjustments";
    }
    case "resize": {
      const s = step.settings;
      if (s.reset_size) return "Resets the size";
      return join([`${s.megapixels} MP`, `multiple of ${s.multiple}`, frameRate(s.frame_rate)]);
    }
    case "split_video": {
      const s = step.settings;
      return join([
        s.mode === "scenes"
          ? `At scene changes (${s.sensitivity}), up to ${seconds(s.longest_seconds)}`
          : `Every ${seconds(s.interval_seconds)}`,
        s.shortest_seconds > 0 && `at least ${seconds(s.shortest_seconds)}`,
        frameRate(s.frame_rate),
      ]);
    }
    case "comfy_process": {
      const s = step.settings;
      return join([
        s.preset ? quoted(s.preset) : "No preset",
        s.seed !== null && s.seed !== undefined && `seed ${s.seed}`,
      ]);
    }
    case "strip_metadata":
    case "backup_captions":
    case "restore_captions":
    case "check_caption_rules":
      return "No settings";
  }
}
