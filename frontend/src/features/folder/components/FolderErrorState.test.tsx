import { act, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as foldersApi from "@/features/folder/api/folders";
import { folderKeys } from "@/features/folder/lib/folderQuery";
import { renderWithQueryClient } from "@/test/queryClient";
import { FolderErrorState } from "./FolderErrorState";

const MISSING_FOLDER = "E:\\Photos";

function stubDrives(...letters: string[]) {
  vi.spyOn(foldersApi, "fetchFolderRoots").mockResolvedValue({
    home: "C:\\Users\\me",
    roots: [
      { name: "Home", path: "C:\\Users\\me", kind: "home" },
      ...letters.map((letter) => ({
        name: `${letter}:\\`,
        path: `${letter}:\\`,
        kind: "fixed" as const,
      })),
    ],
  });
}

describe("FolderErrorState", () => {
  it("says the drive is not connected when the folder's drive is gone", async () => {
    stubDrives("C");

    renderWithQueryClient(
      <FolderErrorState error={{ kind: "folder-not-found" }} folderPath={MISSING_FOLDER} />,
    );

    expect(await screen.findByText("Drive E: is not connected")).toBeInTheDocument();
    expect(screen.getByText("Reconnect it and this folder opens again.")).toBeInTheDocument();
  });

  it("re-reads the folder as soon as its drive is back", async () => {
    stubDrives("C");

    const { client } = renderWithQueryClient(
      <FolderErrorState error={{ kind: "folder-not-found" }} folderPath={MISSING_FOLDER} />,
    );
    await screen.findByText("Drive E: is not connected");
    const invalidate = vi.spyOn(client, "invalidateQueries");
    expect(invalidate).not.toHaveBeenCalled();

    stubDrives("C", "E");
    await act(() => client.refetchQueries({ queryKey: folderKeys.roots }));

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: folderKeys.folder(MISSING_FOLDER),
        exact: true,
      }),
    );
  });

  it("says the folder is missing when its drive is still there", async () => {
    stubDrives("C", "E");

    const { client } = renderWithQueryClient(
      <FolderErrorState error={{ kind: "folder-not-found" }} folderPath={MISSING_FOLDER} />,
    );

    await waitFor(() => expect(client.getQueryData(folderKeys.roots)).toBeDefined());
    await act(async () => {});
    expect(screen.getByText("Folder not found")).toBeInTheDocument();
    expect(screen.queryByText(/is not connected/)).not.toBeInTheDocument();
  });

  it("does not look up drives for a path without a drive letter", () => {
    const roots = vi.spyOn(foldersApi, "fetchFolderRoots");

    renderWithQueryClient(
      <FolderErrorState error={{ kind: "folder-not-found" }} folderPath="/home/photos" />,
    );

    expect(screen.getByText("Folder not found")).toBeInTheDocument();
    expect(roots).not.toHaveBeenCalled();
  });
});
