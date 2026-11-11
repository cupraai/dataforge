import { CAPTION_RULES_FILENAME, CLIPS_DIR_NAME, JOB_TYPE_LABELS } from "@/shared/constants";
import type { ReactNode } from "react";
import type { AppIcon } from "@/shared/icons";
import {
  iconAiToolkit,
  iconArchive,
  iconArchiveRestore,
  iconComfyUi,
  iconFilePen,
  iconFiles,
  iconMessagePlus,
  iconMessageWarning,
  iconPencilSparkles,
  iconReplace,
  iconScaling,
  iconScissors,
  iconShredder,
  iconSparkles,
  iconSpellCheck2,
  iconStamp,
  iconWandSparkles,
} from "@/shared/icons";
import type { JobType } from "@/shared/types";

type JobStartUi = "dialog" | "confirm";

export interface JobAvailability {
  syspromptApplies: boolean;
  hasCaptionBackup: boolean;
  ostrisAvailable: boolean;
  comfyPresetsAvailable: boolean;
}

/**
 * Tools menu sections, by what a job changes: caption text, nothing (findings for the Review menu),
 * pixels, or file names, metadata and backups. Jobs run by external tools span the menu below.
 */
const JOB_GROUP_DEFINITIONS = [
  { id: "captions", label: "Captions" },
  { id: "check", label: "Check" },
  { id: "media", label: "Media" },
  { id: "files", label: "Files" },
  { id: "integrations", label: "Integrations", wide: true },
] as const;

type JobGroup = (typeof JOB_GROUP_DEFINITIONS)[number]["id"];

interface JobTypeMeta {
  type: JobType;
  icon: AppIcon;
  startUi: JobStartUi;
  group: JobGroup;
  menuLabel?: string;
  menuDescription?: string;
  confirm?: {
    title: string;
    description: () => ReactNode;
    confirmLabel: string;
  };
  requires?: { flag: keyof JobAvailability; reason: string };
}

// Entry order is menu order: the jobs filter and Quick actions list jobs in this order too.
export const JOB_TYPE_META = {
  auto_caption: {
    type: "auto_caption" as const,
    group: "captions" as const,
    icon: iconSparkles,
    startUi: "dialog" as const,
    menuDescription: "Write missing captions and expand drafts with the local model.",
    requires: {
      flag: "syspromptApplies",
      reason: "Create folder instructions to enable auto-captioning.",
    },
  },
  replace_captions: {
    type: "replace_captions" as const,
    group: "captions" as const,
    icon: iconReplace,
    startUi: "dialog" as const,
    menuDescription: "Search and replace, prepend, or append text across captions.",
  },
  edit_captions: {
    type: "edit_captions" as const,
    group: "captions" as const,
    icon: iconPencilSparkles,
    startUi: "dialog" as const,
    menuDescription: "Rewrite existing captions with the local model, from your instruction.",
  },
  set_captions: {
    type: "set_captions" as const,
    group: "captions" as const,
    icon: iconMessagePlus,
    startUi: "dialog" as const,
    menuDescription: "Write the same caption text to media files.",
  },
  check_caption_rules: {
    type: "check_caption_rules" as const,
    group: "check" as const,
    icon: iconSpellCheck2,
    startUi: "dialog" as const,
    menuDescription: `Check captions against your ${CAPTION_RULES_FILENAME} file, no model needed.`,
  },
  verify_captions: {
    type: "verify_captions" as const,
    group: "check" as const,
    icon: iconMessageWarning,
    startUi: "dialog" as const,
    menuDescription: "Have the local model compare each caption with its media.",
  },
  find_duplicates: {
    type: "find_duplicates" as const,
    group: "check" as const,
    icon: iconFiles,
    startUi: "dialog" as const,
    menuDescription: "Find duplicate and near-duplicate media and group them for review.",
  },
  auto_adjust: {
    type: "auto_adjust" as const,
    group: "media" as const,
    icon: iconWandSparkles,
    startUi: "dialog" as const,
    menuDescription: "Correct exposure, contrast and color with the Adjust wand.",
  },
  resize: {
    type: "resize" as const,
    group: "media" as const,
    icon: iconScaling,
    startUi: "dialog" as const,
    menuDescription: "Scale media to a megapixel size with sides on a pixel grid, for training.",
  },
  split_video: {
    type: "split_video" as const,
    group: "media" as const,
    icon: iconScissors,
    startUi: "dialog" as const,
    menuDescription: `Cut videos into short clips in a ${CLIPS_DIR_NAME} folder, at scene changes or evenly.`,
  },
  watermark: {
    type: "watermark" as const,
    group: "media" as const,
    icon: iconStamp,
    startUi: "dialog" as const,
    menuDescription: "Add a watermark to media files.",
  },
  batch_rename: {
    type: "batch_rename" as const,
    group: "files" as const,
    icon: iconFilePen,
    startUi: "dialog" as const,
    menuDescription: "Rename media files.",
  },
  strip_metadata: {
    type: "strip_metadata" as const,
    group: "files" as const,
    icon: iconShredder,
    startUi: "confirm" as const,
    menuDescription: "Remove embedded metadata from media files.",
    confirm: {
      title: "Start strip metadata?",
      description: () => <>Removes embedded metadata from every PNG and MP4 in scope.</>,
      confirmLabel: "Start strip metadata",
    },
  },
  backup_captions: {
    type: "backup_captions" as const,
    group: "files" as const,
    icon: iconArchive,
    startUi: "dialog" as const,
    menuDescription: "Copy captions into the .backup folder.",
  },
  restore_captions: {
    type: "restore_captions" as const,
    group: "files" as const,
    icon: iconArchiveRestore,
    startUi: "dialog" as const,
    menuDescription: "Bring captions back from the .backup folder.",
    requires: { flag: "hasCaptionBackup", reason: "No caption backup in this folder." },
  },
  comfy_process: {
    type: "comfy_process" as const,
    group: "integrations" as const,
    icon: iconComfyUi,
    startUi: "dialog" as const,
    menuLabel: "Process with ComfyUI",
    menuDescription: "Process images and videos with a ComfyUI workflow, for review.",
    requires: {
      flag: "comfyPresetsAvailable",
      reason: "No ComfyUI presets are available. Configure workflows in Settings.",
    },
  },
  train_lora: {
    type: "train_lora" as const,
    group: "integrations" as const,
    icon: iconAiToolkit,
    startUi: "dialog" as const,
    menuLabel: "Quick LoRA training",
    menuDescription: "Train a LoRA on this folder with Ostris AI-Toolkit.",
    requires: {
      flag: "ostrisAvailable",
      reason: "AI-Toolkit is unavailable. Check its connection in Settings.",
    },
  },
} satisfies Record<JobType, JobTypeMeta>;

type JobTypeWithStartUi<Ui extends JobStartUi> = {
  [K in JobType]: (typeof JOB_TYPE_META)[K]["startUi"] extends Ui ? K : never;
}[JobType];

export type ConfirmableJobType = JobTypeWithStartUi<"confirm">;

export const JOB_TYPES = Object.keys(JOB_TYPE_META) as JobType[];

function jobTypeMeta(type: JobType): JobTypeMeta {
  return JOB_TYPE_META[type];
}

export const JOB_GROUPS: Array<{
  id: JobGroup;
  label: string;
  /** Spans the menu below the columns instead of taking one. */
  wide: boolean;
  types: JobType[];
}> = JOB_GROUP_DEFINITIONS.map((group) => ({
  id: group.id,
  label: group.label,
  wide: "wide" in group && group.wide,
  types: JOB_TYPES.filter((type) => jobTypeMeta(type).group === group.id),
})).filter((group) => group.types.length > 0);

export function jobTypeLabelFor(type: JobType): string {
  return JOB_TYPE_LABELS[type];
}

/** The name a job is offered under in menus, e.g. "Quick LoRA training". */
export function jobMenuLabelFor(type: JobType): string {
  return jobTypeMeta(type).menuLabel ?? jobTypeLabelFor(type);
}

export interface JobStartContext {
  hasFolder: boolean;
  /** Another start request is in flight. */
  starting: boolean;
  /** Files in scope: the visible selection, or the visible results. */
  itemCount: number;
  /** Every file in the folder; LoRA training ignores the scope. */
  folderCount: number;
  availability: JobAvailability;
}

export interface JobStartBlock {
  blocked: boolean;
  /** Why, when the user can do something about it; null for transient or obvious blocks. */
  reason: string | null;
}

/** Whether a job can start now. Shared by Tools and Quick actions. */
export function jobStartBlock(type: JobType, context: JobStartContext): JobStartBlock {
  const requirement = jobTypeMeta(type).requires;
  const reason = requirement && !context.availability[requirement.flag] ? requirement.reason : null;
  const emptyScope = type === "train_lora" ? context.folderCount === 0 : context.itemCount === 0;
  return {
    blocked: !context.hasFolder || context.starting || emptyScope || reason !== null,
    reason,
  };
}

export function jobTypeIconFor(type: JobType): AppIcon {
  return JOB_TYPE_META[type].icon;
}

export function isConfirmableJobType(type: JobType): type is ConfirmableJobType {
  return JOB_TYPE_META[type].startUi === "confirm";
}

export const JOB_START_CONFIRM: Record<ConfirmableJobType, NonNullable<JobTypeMeta["confirm"]>> = {
  strip_metadata: JOB_TYPE_META.strip_metadata.confirm,
};
