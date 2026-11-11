import type { ReactNode } from "react";
import { iconCheck, iconFolder } from "@/shared/icons";
import { Icon } from "./Icon";
import type { BulkScopeKind } from "@/features/automation/lib/bulkScope";

export interface DialogScopeInfo {
  itemCount: number;
  folderLabel: string;
  kind: BulkScopeKind;
  note?: ReactNode;
  /** The job, or count of jobs, a start now waits for; absent when it would start at once. */
  queuedAfter?: string;
}

export function DialogScope({ itemCount, folderLabel, kind, note, queuedAfter }: DialogScopeInfo) {
  const files = itemCount === 1 ? "file" : "files";

  return (
    <div className="dialog-scope">
      <p className="dialog-scope__line">
        <Icon icon={kind === "selected" ? iconCheck : iconFolder} className="dialog-scope__icon" />
        <span>
          {kind === "selected" ? (
            <>
              <strong>{itemCount}</strong> selected {files}
            </>
          ) : (
            <>
              {kind === "visible" ? "Matching" : "All"} <strong>{itemCount}</strong> {files}
            </>
          )}{" "}
          in <strong className="dialog-scope__folder">{folderLabel}</strong>
          {queuedAfter && (
            <span className="dialog-scope__queue">
              , queued after <strong>{queuedAfter}</strong>
            </span>
          )}
        </span>
      </p>
      {note && <p className="dialog-scope__note">{note}</p>}
    </div>
  );
}
