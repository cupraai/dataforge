import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HOME_PATH } from "@/test/fixtures";
import { installMockBackend } from "@/test/mockBackend";
import { renderWithQueryClient } from "@/test/queryClient";
import type { Workflow } from "@/shared/types";
import { WorkflowEditorDialog } from "./WorkflowEditorDialog";

const stepDialogs = {
  folderPath: HOME_PATH,
  folderLabel: "Photos",
  itemCount: 4,
  folderItemCount: 4,
  scopeKind: "folder" as const,
  comfyPresetsAvailable: false,
};

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

function renderEditor(
  workflows: Workflow[] = [],
  initialName: string | null = null,
  scope: Partial<typeof stepDialogs & { getJobPaths: () => string[] }> = {},
) {
  const backend = installMockBackend({ workflows });
  const onClose = vi.fn<() => void>();
  renderWithQueryClient(
    <WorkflowEditorDialog
      workflows={workflows}
      initialName={initialName}
      stepDialogs={{ ...stepDialogs, ...scope }}
      onClose={onClose}
    />,
  );
  return { ...backend, onClose };
}

function stepCards() {
  return within(screen.getByRole("list", { name: "Steps" })).getAllByRole("listitem");
}

async function addStep(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole("button", { name: `Add ${label}` }));
}

describe("WorkflowEditorDialog", () => {
  it("builds a workflow from job dialogs and saves it", async () => {
    const user = userEvent.setup();
    const { requestsTo } = renderEditor();

    await user.type(screen.getByLabelText("Name"), "Prep");
    await addStep(user, "Resize");
    const resize = await screen.findByRole("dialog", { name: "Resize media?" });
    const megapixels = within(resize).getByLabelText("Megapixels");
    await user.clear(megapixels);
    await user.type(megapixels, "1");
    await user.click(within(resize).getByRole("button", { name: "Save step" }));

    await waitFor(() => expect(stepCards()).toHaveLength(1));
    expect(stepCards()[0]).toHaveTextContent("1 MP · multiple of 32");
    // A job with nothing to set goes straight in, without a dialog.
    await addStep(user, "Strip metadata");
    expect(stepCards()).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(requestsTo("/api/workflows", "PUT")).toHaveLength(1));
    const [[, init]] = requestsTo("/api/workflows", "PUT");
    const body = JSON.parse(init?.body as string) as { workflow: Workflow };
    expect(body.workflow.name).toBe("Prep");
    expect(body.workflow.steps.map((step) => step.job_type)).toEqual(["resize", "strip_metadata"]);
    expect(body.workflow.steps[0].settings).toMatchObject({ megapixels: 1, multiple: 32 });
    // Never starts a job: the dialog only configured a step.
    expect(
      requestsTo(`/api/automation/resize?path=${encodeURIComponent(HOME_PATH)}`, "POST"),
    ).toEqual([]);
  });

  it("edits a step's settings in its own dialog, opened with the step's values", async () => {
    const user = userEvent.setup();
    renderEditor([prep], "Prep");

    await user.click(screen.getByRole("button", { name: "Edit Resize settings" }));
    const resize = await screen.findByRole("dialog", { name: "Resize media?" });

    expect(within(resize).getByLabelText("Megapixels")).toHaveValue(1);
    expect(within(resize).getByLabelText("Multiple of (px)")).toHaveValue(16);
  });

  it("configures Auto-caption when the current folder has no system prompt or files in scope", async () => {
    const user = userEvent.setup();
    const { requestsTo } = renderEditor([], null, {
      folderPath: "C:\\Empty",
      folderLabel: "Empty",
      itemCount: 0,
      folderItemCount: 0,
      getJobPaths: () => [],
    });

    await user.type(screen.getByLabelText("Name"), "Caption media");
    await addStep(user, "Auto-caption");
    const dialog = await screen.findByRole("dialog", { name: "Start auto-caption?" });
    await user.click(within(dialog).getByRole("checkbox", { name: "Caption audio" }));
    await user.click(within(dialog).getByRole("button", { name: "Save step" }));
    expect(stepCards()[0]).toHaveAccessibleName("Step 1: Auto-caption");

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(requestsTo("/api/workflows", "PUT")).toHaveLength(1));
    const [[, init]] = requestsTo("/api/workflows", "PUT");
    expect(JSON.parse(init?.body as string).workflow.steps).toMatchObject([
      { job_type: "auto_caption", settings: { caption_audio: true } },
    ]);
  });
  it("reorders with the move buttons and Alt+Arrow keys", async () => {
    const user = userEvent.setup();
    renderEditor([prep], "Prep");

    await user.click(screen.getByRole("button", { name: "Move Strip metadata up" }));
    expect(stepCards()[0]).toHaveAccessibleName("Step 1: Strip metadata");

    screen.getByRole("button", { name: "Move Strip metadata down" }).focus();
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");
    expect(stepCards()[0]).toHaveAccessibleName("Step 1: Resize");

    await user.click(screen.getByRole("button", { name: "Remove Strip metadata" }));
    expect(stepCards()).toHaveLength(1);
  });

  it("keeps Rename the last step", async () => {
    const user = userEvent.setup();
    renderEditor([prep], "Prep");

    await addStep(user, "Rename");
    const rename = await screen.findByRole("dialog", { name: "Rename files?" });
    await user.type(within(rename).getByLabelText("Name stem"), "photo");
    await user.click(within(rename).getByRole("button", { name: "Save step" }));

    await waitFor(() => expect(stepCards()).toHaveLength(3));
    expect(screen.getByRole("button", { name: "Add Strip metadata" })).toBeDisabled();
    expect(screen.getByText("Nothing can follow Rename")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move Rename up" })).toBeDisabled();
  });

  it("asks before closing with unsaved changes", async () => {
    const user = userEvent.setup();
    const { onClose } = renderEditor([prep], "Prep");

    await user.click(screen.getByRole("button", { name: "Remove Strip metadata" }));
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("refuses a name another workflow already has", async () => {
    const user = userEvent.setup();
    renderEditor([prep]);

    await user.type(screen.getByLabelText("Name"), "prep");
    await addStep(user, "Strip metadata");

    expect(screen.getByRole("alert")).toHaveTextContent('A workflow named "prep" already exists');
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
