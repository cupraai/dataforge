import { importFiles } from "@/features/folder/api/files";
import { pathBaseName } from "@/features/gallery/lib/mediaActionMessages";
import type { FileImportResponse, NotificationVariant } from "@/shared/types";

type FrameNotice = { variant: NotificationVariant; message: string };

export const JPEG_QUALITY = 0.95;

export interface FrameCapture {
  frameMode: boolean;
  ready: boolean;
  saving: boolean;
  toggleFrameMode: () => void;
  exitFrameMode: () => void;
  stepFrame: (direction: -1 | 1) => void;
  saveFrame: () => void;
}

export function frameTargetStem(path: string): string {
  const base = pathBaseName(path);
  const dot = base.lastIndexOf(".");
  // dot > 0, not !== -1, so a dotfile name (.gif) keeps its name instead of the stamp.
  return dot > 0 ? base.slice(0, dot) : base;
}

export function frameSaveOutcome(result: FileImportResponse, targetName: string): FrameNotice {
  if (result.copied.length > 0) {
    return { variant: "success", message: `Saved frame as ${targetName}.` };
  }
  if (result.rejected.length > 0) {
    return {
      variant: "danger",
      message: `Could not save ${targetName}: the server rejected that file.`,
    };
  }
  if (result.skipped.length > 0) {
    return {
      variant: "warning",
      message: `${targetName} was not saved - the server skipped it.`,
    };
  }
  return {
    variant: "danger",
    message: `Could not save ${targetName}: the server saved nothing.`,
  };
}

/** Saves the frame as a JPEG in `destination` and reports how that went; true once it landed. */
export async function importFrame(
  destination: string,
  blob: Blob,
  targetName: string,
  notify: (notice: FrameNotice) => void,
): Promise<boolean> {
  const file = new File([blob], targetName, { type: "image/jpeg" });
  const outcome = frameSaveOutcome(await importFiles(destination, [file], true), targetName);
  notify(outcome);
  return outcome.variant === "success";
}
