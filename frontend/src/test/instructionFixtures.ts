import type { InstructionFileResponse } from "@/shared/types";

/** Readable instruction files for tests; error states can be supplied explicitly. */
export function instructionFile(
  overrides: Partial<InstructionFileResponse> = {},
  filename = ".sysprompt",
  folder = "C:\\datasets\\sample",
): InstructionFileResponse {
  const text = overrides.text ?? "";
  const hasFile = overrides.has_file ?? false;
  const parentFolder = overrides.parent_folder ?? null;
  const parentText = overrides.parent_text ?? "";
  const parentPath = overrides.parent_relative_path ?? null;
  const parentState =
    parentFolder === null
      ? null
      : {
          origin: "inherited" as const,
          status: parentText.trim() ? ("ready" as const) : ("empty" as const),
          source_path: `${parentFolder}\\${filename}`,
          relative_path: parentPath,
          text: parentText,
          message: null,
        };
  return {
    text,
    has_file: hasFile,
    parent_folder: parentFolder,
    parent_relative_path: parentPath,
    parent_text: parentText,
    locked_by_job_id: null,
    parent_state: parentState,
    state: hasFile
      ? {
          origin: "local",
          status: text.trim() ? "ready" : "empty",
          source_path: `${folder}\\${filename}`,
          relative_path: filename,
          text,
          message: null,
        }
      : (parentState ?? {
          origin: "missing",
          status: "missing",
          source_path: null,
          relative_path: null,
          text: "",
          message: null,
        }),
    ...overrides,
  };
}
