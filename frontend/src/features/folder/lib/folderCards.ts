import type { Subfolder } from "@/shared/types";

export const FOLDER_CLAMP_LIMIT = 10;

// A shorter tail is not worth the button, and keeps "Show N more folders" plural.
export const FOLDER_CLAMP_MIN_HIDDEN = 5;

export function folderFindings({ issue_count: issues }: Subfolder): string[] {
  if (!issues) return [];
  return [issues === 1 ? "1 caption issue" : `${issues} caption issues`];
}

export function folderCardLabel(folder: Subfolder): string {
  const findings = folderFindings(folder);
  return findings.length > 0 ? `${folder.name} (${findings.join(", ")})` : folder.name;
}

export function hasFolderFindings(folder: Subfolder): boolean {
  return folderFindings(folder).length > 0;
}

export interface FolderClamp {
  visible: Subfolder[];
  hidden: number;
  hiddenFlagged: number;
}

/** Counts cards, not rows, so `hidden` stays exact while columns auto-fill. */
export function clampFolders(folders: readonly Subfolder[]): FolderClamp {
  if (folders.length < FOLDER_CLAMP_LIMIT + FOLDER_CLAMP_MIN_HIDDEN) {
    return { visible: [...folders], hidden: 0, hiddenFlagged: 0 };
  }

  const hiddenFolders = folders.slice(FOLDER_CLAMP_LIMIT);
  return {
    visible: folders.slice(0, FOLDER_CLAMP_LIMIT),
    hidden: hiddenFolders.length,
    hiddenFlagged: hiddenFolders.filter(hasFolderFindings).length,
  };
}
