import { instructionFile } from "@/test/instructionFixtures";
import { describe, expect, it } from "vitest";
import { instructionApplies } from "./folderInstructions";

const NO_FILE = instructionFile();

describe("instructionApplies", () => {
  it("applies the folder's own text", () => {
    expect(instructionApplies(instructionFile({ text: "Describe.", has_file: true }))).toBe(true);
  });

  it("falls back to the parent's text while the folder has no file", () => {
    expect(
      instructionApplies(
        instructionFile({ parent_folder: "C:\\datasets", parent_text: "Describe." }),
      ),
    ).toBe(true);
  });

  it("lets an empty file of the folder's own hide the parent's", () => {
    expect(
      instructionApplies(instructionFile({ text: "  ", has_file: true, parent_text: "Describe." })),
    ).toBe(false);
  });

  it("does not apply when there is nothing anywhere", () => {
    expect(instructionApplies(NO_FILE)).toBe(false);
  });

  it.each(["invalid", "unreadable", "empty"] as const)(
    "does not use %s files even with text",
    (status) => {
      const file = instructionFile({ text: "unknown: value", has_file: true });
      expect(instructionApplies({ ...file, state: { ...file.state, status } })).toBe(false);
    },
  );
});
