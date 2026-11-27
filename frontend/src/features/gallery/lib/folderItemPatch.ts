import type { CaptionSaveResponse, FolderResponse, GalleryItem } from "@/shared/types";
import { pathBaseName } from "@/features/gallery/lib/mediaActionMessages";

function patchItem(
  folder: FolderResponse,
  path: string,
  patch: (item: GalleryItem) => GalleryItem,
): FolderResponse {
  return {
    ...folder,
    items: folder.items.map((item) => (item.path === path ? patch(item) : item)),
  };
}

/** Moves an item to its new name in place; the next listing settles its sort position. */
export function applyFolderItemRename(
  folder: FolderResponse,
  path: string,
  renamedPath: string,
): FolderResponse {
  return patchItem(folder, path, (item) => ({
    ...item,
    path: renamedPath,
    name: pathBaseName(renamedPath),
  }));
}

export function applyFolderCaptionSave(
  folder: FolderResponse,
  path: string,
  update: CaptionSaveResponse,
): FolderResponse {
  return patchItem(folder, path, (item) => ({
    ...item,
    description: update.description,
    has_description: update.has_description,
    has_caption_file: update.has_caption_file,
    caption_status: update.caption_status,
    caption_revision: update.caption_revision,
    caption_read_error: update.caption_read_error,
    issue_fixes: update.issue_fixes,
    rule_findings: update.rule_findings,
    has_issue_file: update.has_issue_file,
    issue_fixes_revision: update.issue_fixes_revision,
    rule_findings_revision: update.rule_findings_revision,
  }));
}
