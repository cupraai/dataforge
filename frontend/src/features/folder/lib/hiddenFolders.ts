import { foldersMatch, isInsideFolder } from "@/features/folder/lib/folderPath";

/** Drops hidden folders, except one holding the open folder; returns `folders` if none drop. */
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
