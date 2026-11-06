import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { driveRootOf, listDrives } from "@/features/folder/lib/drives";
import { folderKeys, folderRootsQueryOptions } from "@/features/folder/lib/folderQuery";
import { FOLDER_NOT_FOUND, type FolderError } from "@/shared/api/http";
import { iconCircleAlert, iconUnplug } from "@/shared/icons";
import { EmptyState } from "@/shared/ui/EmptyState";

type FolderErrorStateProps = {
  /** An unreachable backend is reported app-wide by `BackendUnavailable`, never here. */
  error: Exclude<FolderError, { kind: "backend-unreachable" }>;
  /** The folder that failed to open, to tell a disconnected drive from a missing folder. */
  folderPath?: string;
};

export function FolderErrorState({ error, folderPath }: FolderErrorStateProps) {
  const drive = folderPath ? driveRootOf(folderPath) : null;
  const notFound = error.kind === "folder-not-found";
  // The path bar's drive menu polls the same list, so this follows a drive coming back.
  const rootsQuery = useQuery({ ...folderRootsQueryOptions(), enabled: notFound && !!drive });
  const drives = rootsQuery.data ? listDrives(rootsQuery.data.roots) : null;
  const drivesKnown = drives !== null;
  const driveMissing = Boolean(drive && drives && !drives.some((entry) => entry.path === drive));

  // The folder poll is slow; once the drive is back, re-read the folder instead of waiting.
  const queryClient = useQueryClient();
  const wasMissingRef = useRef(false);
  useEffect(() => {
    if (driveMissing) {
      wasMissingRef.current = true;
    } else if (wasMissingRef.current && drivesKnown) {
      wasMissingRef.current = false;
      void queryClient.invalidateQueries({ queryKey: folderKeys.folder(folderPath), exact: true });
    }
  }, [driveMissing, drivesKnown, folderPath, queryClient]);

  if (notFound && drive && driveMissing) {
    return (
      <EmptyState
        icon={iconUnplug}
        title={`Drive ${drive.slice(0, 2)} is not connected`}
        description="Reconnect it and this folder opens again."
        variant="error"
        role="alert"
      />
    );
  }

  if (notFound) {
    return (
      <EmptyState
        icon={iconCircleAlert}
        title={FOLDER_NOT_FOUND.title}
        description={FOLDER_NOT_FOUND.description}
        variant="error"
        role="alert"
      />
    );
  }

  return (
    <EmptyState
      icon={iconCircleAlert}
      title="Something went wrong"
      description={error.message}
      variant="error"
      role="alert"
    />
  );
}
