/** Visible selection, else what search and filters show, else the folder. */
export interface ReviewScope {
  kind: "selected" | "matching" | "folder";
  fileCount: number;
}

export function reviewScopeFor(
  selectedCount: number,
  narrowed: boolean,
  matchingCount: number,
  folderCount: number,
): ReviewScope {
  if (selectedCount > 0) return { kind: "selected", fileCount: selectedCount };
  if (narrowed) return { kind: "matching", fileCount: matchingCount };
  return { kind: "folder", fileCount: folderCount };
}

/** Appended to a queue's count, so hidden files are never a surprise: "" for the whole folder. */
export function reviewScopeSuffix(scope: ReviewScope | undefined): string {
  if (!scope || scope.kind === "folder") return "";
  const files = scope.fileCount === 1 ? "file" : "files";
  return ` in ${scope.fileCount} ${scope.kind} ${files}`;
}

/** A toolbar menu's one-line note on what its actions cover. */
export function reviewScopeNote(scope: ReviewScope | undefined): string {
  if (!scope || scope.kind === "folder") return "Whole folder";
  const files = scope.fileCount === 1 ? "file" : "files";
  return `${scope.fileCount} ${scope.kind} ${files}`;
}
