import { describe, expect, it } from "vitest";
import {
  JOB_GROUPS,
  JOB_START_CONFIRM,
  JOB_TYPES,
  isConfirmableJobType,
  jobStartBlock,
  type JobStartContext,
} from "./jobMeta";

const ready: JobStartContext = {
  hasFolder: true,
  starting: false,
  itemCount: 1,
  folderCount: 1,
  availability: {
    syspromptApplies: true,
    hasCaptionBackup: true,
    ostrisAvailable: true,
    comfyPresetsAvailable: true,
    comfyGeneratePresetsAvailable: true,
  },
};

describe("jobStartBlock", () => {
  it.each([
    ["auto_caption", "syspromptApplies"],
    ["restore_captions", "hasCaptionBackup"],
    ["train_lora", "ostrisAvailable"],
    ["comfy_process", "comfyPresetsAvailable"],
    ["comfy_generate", "comfyGeneratePresetsAvailable"],
  ] as const)("blocks only %s when %s is missing", (jobType, flag) => {
    const context = { ...ready, availability: { ...ready.availability, [flag]: false } };
    expect(JOB_TYPES.filter((type) => jobStartBlock(type, context).blocked)).toEqual([jobType]);
    expect(jobStartBlock(jobType, ready)).toEqual({ blocked: false, reason: null });
  });
});

describe("jobStartBlock scope", () => {
  it("lets generation start in an empty folder, which nothing else can run on", () => {
    const empty = { ...ready, itemCount: 0, folderCount: 0 };

    expect(JOB_TYPES.filter((type) => !jobStartBlock(type, empty).blocked)).toEqual([
      "comfy_generate",
    ]);
  });
});

describe("JOB_START_CONFIRM", () => {
  it("gives every confirm-started job its dialog copy", () => {
    const confirmable = JOB_TYPES.filter(isConfirmableJobType);
    expect(confirmable).toContain("strip_metadata");

    // Restoring lists the captions it would change, so both backup jobs open a dialog instead.
    expect(confirmable).not.toContain("backup_captions");
    expect(confirmable).not.toContain("restore_captions");

    // `confirm` is optional, so a confirm job could reach the dialog empty.
    for (const type of confirmable) {
      const copy = JOB_START_CONFIRM[type];
      expect(copy?.title).toBeTruthy();
      expect(copy?.confirmLabel).toBeTruthy();
      expect(copy?.description()).toBeTruthy();
    }
  });
});

describe("JOB_GROUPS", () => {
  it("lists every job once in menu order", () => {
    const grouped = JOB_GROUPS.flatMap((group) => group.types);

    // A job missing a section would vanish from the menu entirely.
    expect(grouped).toEqual(JOB_TYPES);
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it("sorts jobs by what they change, each section in workflow order", () => {
    const byId = Object.fromEntries(JOB_GROUPS.map((group) => [group.id, group.types]));

    expect(byId.captions).toEqual([
      "set_captions",
      "auto_caption",
      "replace_captions",
      "edit_captions",
    ]);
    // Check jobs only write findings for the Review menu, never media or captions.
    expect(byId.check).toEqual(["check_caption_rules", "verify_captions", "find_duplicates"]);
    expect(byId.media).toEqual(["auto_adjust", "resize", "trim_video", "split_video", "watermark"]);
    expect(byId.files).toEqual([
      "batch_rename",
      "strip_metadata",
      "backup_captions",
      "restore_captions",
    ]);
    expect(byId.integrations).toEqual(["comfy_generate", "comfy_process", "train_lora"]);
  });
});
