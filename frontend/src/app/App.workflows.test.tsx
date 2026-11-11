import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { HOME_PATH } from "@/test/fixtures";
import { installMockBackend } from "@/test/mockBackend";
import { renderApp } from "@/test/renderApp";
import type { Workflow } from "@/shared/types";

const prep: Workflow = {
  name: "Prep",
  steps: [
    {
      job_type: "resize",
      settings: { megapixels: 1, multiple: 16, frame_rate: null, reset_size: false },
    },
    { job_type: "strip_metadata", settings: {} },
  ],
};

const RUN_URL = `/api/workflows/run?path=${encodeURIComponent(HOME_PATH)}`;

async function waitForHomeFolder() {
  await screen.findByRole("button", { name: "View sunset.png" });
}

function runBodies(requestsTo: ReturnType<typeof installMockBackend>["requestsTo"]) {
  return requestsTo(RUN_URL, "POST").map(
    ([, init]) => JSON.parse(init?.body as string) as { name: string; paths: string[] | null },
  );
}

afterEach(() => {
  localStorage.clear();
});

describe("App: workflows", () => {
  it("runs a saved workflow from the toolbar after showing its steps", async () => {
    const user = userEvent.setup();
    const { requestsTo } = installMockBackend({ workflows: [prep] });
    renderApp();
    await waitForHomeFolder();

    await user.click(screen.getByRole("button", { name: "Workflows" }));
    await user.click(await screen.findByRole("menuitem", { name: /^Run Prep/ }));

    const dialog = await screen.findByRole("dialog", { name: "Run workflow?" });
    const steps = within(within(dialog).getByRole("list", { name: "Steps" })).getAllByRole(
      "listitem",
    );
    expect(steps.map((step) => step.textContent)).toEqual([
      "1Resize1 MP · multiple of 16",
      "2Strip metadataNo settings",
    ]);
    await user.click(within(dialog).getByRole("button", { name: "Run workflow" }));

    // Like any job, the run takes the files in view, fixed now.
    await waitFor(() => expect(runBodies(requestsTo)).toHaveLength(1));
    expect(runBodies(requestsTo)[0].name).toBe("Prep");
    expect(runBodies(requestsTo)[0].paths).toContain(`${HOME_PATH}\\sunset.png`);
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Run workflow?" })).not.toBeInTheDocument();
    });
  });

  it("runs on the selection fixed when the run was asked for", async () => {
    const user = userEvent.setup();
    const { requestsTo } = installMockBackend({ workflows: [prep] });
    renderApp();
    await waitForHomeFolder();

    fireEvent.click(screen.getByRole("button", { name: "View sunset.png" }), { ctrlKey: true });
    await screen.findByRole("button", { name: "Exit selection mode" });
    await user.click(screen.getByRole("button", { name: "Workflows" }));
    await user.click(await screen.findByRole("menuitem", { name: /^Run Prep/ }));
    const dialog = await screen.findByRole("dialog", { name: "Run workflow?" });
    // The scope is said once, in the run dialog, not in the menu.
    expect(within(dialog).getByText(/selected file/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Run workflow" }));

    await waitFor(() => expect(runBodies(requestsTo)).toHaveLength(1));
    expect(runBodies(requestsTo)[0].paths).toEqual([`${HOME_PATH}\\sunset.png`]);
  });

  it("offers each workflow in Quick actions", async () => {
    const user = userEvent.setup();
    installMockBackend({ workflows: [prep] });
    renderApp();
    await waitForHomeFolder();

    await user.keyboard("{Control>}p{/Control}");
    const palette = await screen.findByRole("dialog", { name: "Quick actions" });
    await user.type(within(palette).getByRole("combobox"), "Run workflow");
    await user.click(await within(palette).findByRole("option", { name: /Run workflow: Prep/ }));

    expect(await screen.findByRole("dialog", { name: "Run workflow?" })).toBeInTheDocument();
  });

  it("opens the editor from the menu on a new workflow", async () => {
    const user = userEvent.setup();
    installMockBackend();
    renderApp();
    await waitForHomeFolder();

    await user.click(screen.getByRole("button", { name: "Workflows" }));
    await user.click(await screen.findByRole("menuitem", { name: "Create a workflow" }));

    const editor = await screen.findByRole("dialog", { name: "Workflows" });
    expect(within(editor).getByLabelText("Name")).toHaveValue("");
  });

  it("names each step in a workflow's menu row", async () => {
    const user = userEvent.setup();
    installMockBackend({ workflows: [prep] });
    renderApp();
    await waitForHomeFolder();

    await user.click(screen.getByRole("button", { name: "Workflows" }));
    expect(
      await screen.findByRole("menuitem", { name: "Run Prep: Resize, then Strip metadata" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /^Edit / })).not.toBeInTheDocument();
  });
});
