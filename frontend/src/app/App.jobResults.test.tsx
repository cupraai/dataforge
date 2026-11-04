import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { HOME_PATH } from "@/test/fixtures";
import { installMockBackend } from "@/test/mockBackend";
import { renderApp } from "@/test/renderApp";
import type { Job } from "@/shared/types";

const failedJob: Job = {
  workflow_edited: false,
  undoable: false,
  id: "job-auto-caption",
  folder: HOME_PATH,
  folder_name: "Photos",
  job_type: "auto_caption",
  status: "completed",
  effective_status: "completed",
  total: 4,
  processed: 4,
  current_file: null,
  current_name: null,
  stats: { total: 4, success: 3, write_error: 1 },
  error: null,
  created_at: "2026-01-01T00:00:00Z",
  revision: 1,
  started_at: "2026-01-01T00:00:01Z",
  finished_at: "2026-01-01T00:01:00Z",
};

function installBackendWithFailedJob() {
  return installMockBackend({
    jobs: [failedJob],
    jobResults: {
      "job-auto-caption": [
        {
          path: HOME_PATH + "\\sunset.png",
          name: "sunset.png",
          status: "success",
          shared_with: [],
        },
        {
          path: HOME_PATH + "\\beach.jpg",
          name: "beach.jpg",
          status: "write_error",
          message: "Permission denied",
          shared_with: [],
        },
        { path: HOME_PATH + "\\waves.mp4", name: "waves.mp4", status: "success", shared_with: [] },
        // Moved or deleted since the job ran.
        { path: HOME_PATH + "\\gone.png", name: "gone.png", status: "success", shared_with: [] },
      ],
    },
  });
}

describe("App: job results", () => {
  it("lists the files a finished job failed on", async () => {
    const user = userEvent.setup();
    installBackendWithFailedJob();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /^Open automation jobs/ }));
    await user.click(await screen.findByRole("button", { name: /1 failed/ }));

    const row = await screen.findByText("Permission denied");
    expect(row).toBeInTheDocument();
    expect(screen.getByText("Write error")).toBeInTheDocument();
  });

  it("scopes a retry to the failed files only", async () => {
    const user = userEvent.setup();
    installBackendWithFailedJob();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /^Open automation jobs/ }));
    await user.click(await screen.findByRole("button", { name: /1 failed/ }));
    await user.click(await screen.findByRole("button", { name: "Retry 1 failed" }));

    const dialog = await screen.findByRole("dialog", { name: "Start auto-caption?" });
    expect(dialog.querySelector(".dialog-scope__line")).toHaveTextContent(
      "1 selected file in Photos",
    );
  });

  it("opens a failed file from its result row", async () => {
    const user = userEvent.setup();
    installBackendWithFailedJob();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /^Open automation jobs/ }));
    await user.click(await screen.findByRole("button", { name: /1 failed/ }));
    await user.click(await screen.findByRole("button", { name: "beach.jpg" }));

    await waitFor(() => {
      expect(screen.getByRole("complementary", { name: "Viewing beach.jpg" })).toBeInTheDocument();
    });
  });

  it("says a file is gone instead of opening another one in its place", async () => {
    const user = userEvent.setup();
    installBackendWithFailedJob();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /^Open automation jobs/ }));
    await user.click(await screen.findByRole("button", { name: /1 failed/ }));
    await user.click(await screen.findByRole("button", { name: "gone.png" }));

    expect(await screen.findByText("gone.png is no longer in this folder.")).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: /^Viewing / })).not.toBeInTheDocument();
    // The drawer stays open, so the list is still there to pick another file from.
    expect(screen.getByRole("button", { name: "beach.jpg" })).toBeInTheDocument();
  });

  it("says a file is hidden by the filters instead of closing on nothing", async () => {
    const user = userEvent.setup();
    installBackendWithFailedJob();
    renderApp();

    await user.type(
      await screen.findByRole("searchbox", {
        name: "Search files and folders by name, caption or tag",
      }),
      "sunset",
    );
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "View beach.jpg" })).not.toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /^Open automation jobs/ }));
    await user.click(await screen.findByRole("button", { name: /1 failed/ }));
    await user.click(await screen.findByRole("button", { name: "beach.jpg" }));

    expect(
      await screen.findByText("beach.jpg is hidden by the current filters or search."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: /^Viewing / })).not.toBeInTheDocument();
  });
});
