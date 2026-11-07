import { foldersMatch, isInsideFolder } from "@/features/folder/lib/folderPath";

/**
 * Leaves hidden folders out while the setting is on, except one that holds the open folder,
 * so the way back to it stays listed. Returns `folders` itself when nothing drops out.
 */
export function visibleFolders<T extends { path: string; hidden: boolean }>(
  folders: T[],
  hideHidden: boolean,
  openFolder?: string,
): T[] {
  if (!hideHidden || !folders.some((folder) => folder.hidden)) return folders;
  return folders.filter(
    (folder) =>
      !folder.hidden ||
      (openFolder !== undefined &&
        (foldersMatch(folder.path, openFolder) || isInsideFolder(openFolder, folder.path))),
  );
}
