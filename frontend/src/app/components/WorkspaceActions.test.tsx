import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AutomationActions } from "@/features/automation/lib/automationActions";
import { JOB_TYPES, jobMenuLabelFor, type JobStartContext } from "@/features/jobs/lib/jobMeta";
import {
  buildRunJobItems,
  quickActionRunJobId,
} from "@/features/quickAction/lib/buildQuickActionItems";
import { ToolbarCompactContext } from "@/features/gallery/lib/toolbarCompact";
import { job } from "@/test/fixtures";
import { installMockBackend } from "@/test/mockBackend";
import { renderWithQueryClient } from "@/test/queryClient";
import { WorkspaceActions, WorkspaceActivity } from "./WorkspaceActions";
import type { JobType } from "@/shared/types";

function renderActions(
  overrides: Partial<AutomationActions> = {},
  context: Partial<JobStartContext> = {},
  compact = false,
) {
  installMockBackend();
  const onRequestStart = vi.fn<(jobType: JobType) => void>();
  const panel: AutomationActions = {
    job: null,
    queuedJobs: [],
    workflows: {
      workflows: [],
      startingWorkflow: null,
      onRunWorkflow: vi.fn<(name: string) => void>(),
      onEditWorkflows: vi.fn<(name: string | null) => void>(),
    },
    startContext: {
      hasFolder: true,
      starting: false,
      itemCount: 1,
      folderCount: 1,
      availability: {
        syspromptApplies: true,
        hasCaptionBackup: true,
        ostrisAvailable: true,
        comfyPresetsAvailable: true,
      },
      ...context,
    },
    onEditSysprompt: vi.fn<() => void>(),
    onRequestStart,
    onCancelJob: vi.fn<() => void>(),
    ...overrides,
  };
  const { unmount } = renderWithQueryClient(
    <ToolbarCompactContext.Provider value={compact}>
      <WorkspaceActions panel={panel} />
      <WorkspaceActivity panel={panel} />
    </ToolbarCompactContext.Provider>,
  );
  return { panel, onRequestStart, unmount };
}

describe("Workspace tools", () => {
  it("keeps the folder actions' names when a crowded toolbar shows only their icons", async () => {
    const user = userEvent.setup();
    renderActions({}, {}, true);

    const tools = screen.getByRole("button", { name: "Tools" });
    await user.hover(tools);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Tools");
  });

  it("does not repeat the Tools label in a tooltip while it is shown", async () => {
    const user = userEvent.setup();
    renderActions();

    await user.hover(screen.getByRole("button", { name: "Tools" }));
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows training progress as steps alongside its status badge", () => {
    renderActions({
      job: job({ job_type: "train_lora", status: "running", processed: 250, total: 1000 }),
    });
    expect(screen.getByText("250 of 1000 steps")).toBeVisible();
    expect(screen.getByText("Running")).toBeVisible();
    expect(screen.getByRole("progressbar", { name: "Job progress" })).toHaveAttribute(
      "aria-valuenow",
      "25",
    );
  });

  it("shows the running file and keeps the start actions beside Cancel for queueing", async () => {
    const user = userEvent.setup();
    renderActions({
      job: job({ status: "running", processed: 2, total: 8, current_name: "landscape.png" }),
    });
    expect(screen.getByText("landscape.png")).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancel job" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Tools" }));
    expect(screen.getByRole("menuitem", { name: /^Auto-caption/ })).toBeEnabled();
  });

  it("counts the jobs queued behind the running one and names them in order", async () => {
    const user = userEvent.setup();
    renderActions({
      job: job({ status: "running", processed: 2, total: 8 }),
      queuedJobs: [
        job({ id: "q1", status: "queued", job_type: "resize" }),
        job({ id: "q2", status: "queued", job_type: "split_video" }),
      ],
    });

    const chip = screen.getByText("2 queued");
    await user.hover(chip);
    expect(await screen.findByText("Then: Resize, Split into clips")).toBeInTheDocument();
  });

  it("names the workflow run of the folder's job and its step", () => {
    renderActions({
      job: job({
        status: "running",
        processed: 2,
        total: 8,
        workflow_run: { id: "r", name: "Prep", step: 2, steps: 3 },
      }),
    });

    expect(screen.getByText("Prep · step 2 of 3")).toBeVisible();
  });

  it("warns that cancelling the running job cancels the queue too", async () => {
    const user = userEvent.setup();
    renderActions({
      job: job({ status: "running", processed: 2, total: 8 }),
      queuedJobs: [job({ id: "q1", status: "queued", job_type: "resize" })],
    });

    await user.click(screen.getByRole("button", { name: "Cancel job" }));
    expect(screen.getByText(/The job queued after it is cancelled too\./)).toBeInTheDocument();
  });

  it("asks before cancelling the running job", async () => {
    const user = userEvent.setup();
    const onCancelJob = vi.fn<() => void>();
    renderActions({ job: job({ status: "running", processed: 2, total: 8 }), onCancelJob });

    await user.click(screen.getByRole("button", { name: "Cancel job" }));
    await user.click(screen.getByRole("button", { name: "Keep running" }));
    expect(onCancelJob).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel job" }));
    const dialog = screen.getByRole("alertdialog", { name: "Cancel auto-caption job?" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel job" }));
    expect(onCancelJob).toHaveBeenCalledTimes(1);
  });

  it("hides a job that finished cleanly", () => {
    renderActions({ job: job({ status: "completed", processed: 8, total: 8 }) });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps a failed job's message until it is dismissed", async () => {
    const user = userEvent.setup();
    renderActions({
      job: job({ status: "failed", processed: 3, total: 8, error: "Disk is full." }),
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Disk is full.");
    await user.click(screen.getByRole("button", { name: "Dismiss job status" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps a dismissed job hidden after a reload", async () => {
    const user = userEvent.setup();
    const failed = job({ status: "failed", processed: 3, total: 8, error: "Disk is full." });
    const { unmount } = renderActions({ job: failed });
    await user.click(screen.getByRole("button", { name: "Dismiss job status" }));
    unmount();

    renderActions({ job: failed });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("points a completed job with failed files to automation jobs", () => {
    renderActions({
      job: job({
        status: "completed",
        processed: 3,
        total: 3,
        stats: { success: 2, write_error: 1 },
      }),
    });
    expect(screen.getByText(/1 file failed/)).toBeVisible();
    expect(screen.getByText(/Open automation jobs to view them and retry/)).toBeVisible();
  });

  it("offers Review only when a queue has findings", () => {
    renderActions({ issueCount: 0, duplicateGroupCount: 0, candidateCount: 0 });
    expect(screen.queryByRole("button", { name: /^Review/ })).not.toBeInTheDocument();
  });

  it("lists every non-empty review queue", async () => {
    const user = userEvent.setup();
    const onResolveIssues = vi.fn<() => void>();
    renderActions({ issueCount: 2, onResolveIssues });
    await user.click(screen.getByRole("button", { name: /^Review/ }));
    const menu = screen.getByRole("menu", { name: "Review queues" });
    await user.click(within(menu).getByRole("menuitem", { name: /Caption issues/ }));
    expect(onResolveIssues).toHaveBeenCalledOnce();
  });

  it("shows system specifications independently of the Tools menu", async () => {
    const user = userEvent.setup();
    renderActions();
    const toggle = screen.getByRole("button", { name: "Toggle system specifications" });
    if (toggle.getAttribute("aria-expanded") === "false") await user.click(toggle);
    expect(await screen.findByRole("region", { name: "System specifications" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Tools" }));
    const menu = screen.getByRole("menu", { name: "Tools" });
    expect(
      within(menu).queryByRole("region", { name: "System specifications" }),
    ).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(toggle);
    expect(screen.queryByRole("region", { name: "System specifications" })).not.toBeInTheDocument();
  });
  it("routes every available tool and matching command to the same job type", async () => {
    const user = userEvent.setup();
    const { panel, onRequestStart } = renderActions();
    const commands = buildRunJobItems({ startContext: panel.startContext, onRequestStart });
    for (const type of JOB_TYPES) {
      await user.click(screen.getByRole("button", { name: "Tools" }));
      const drawer = screen.getByRole("menu", { name: "Tools" });
      const label = within(drawer).getByText(jobMenuLabelFor(type), { exact: true });
      await user.click(label.closest("button")!);
      expect(onRequestStart).toHaveBeenLastCalledWith(type);
    }
    for (const type of JOB_TYPES) {
      // The palette offers the job under the same name and the same rule.
      const command = commands.find((item) => item.id === quickActionRunJobId(type))!;
      expect(command.label).toBe(jobMenuLabelFor(type));
      expect(command.disabled).toBe(false);
      command.run();
      expect(onRequestStart).toHaveBeenLastCalledWith(type);
    }
  });

  it("sections Tools by what each job changes, with integrations last", async () => {
    const user = userEvent.setup();
    renderActions();
    await user.click(screen.getByRole("button", { name: "Tools" }));
    const menu = screen.getByRole("menu", { name: "Tools" });

    const sections = within(menu).getAllByRole("group");
    expect(sections.map((section) => section.getAttribute("aria-label"))).toEqual([
      "Captions",
      "Check",
      "Media",
      "Files",
      "Integrations",
    ]);
    for (const name of [/^Process with ComfyUI/, /^Quick LoRA training/]) {
      expect(within(sections.at(-1)!).getByRole("menuitem", { name })).toBeInTheDocument();
    }
  });

  it("offers Auto-caption under Captions in Tools", async () => {
    const user = userEvent.setup();
    renderActions();
    expect(screen.queryByRole("button", { name: "Auto-caption" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tools" }));
    const captions = screen.getByRole("group", { name: "Captions" });
    expect(within(captions).getByRole("menuitem", { name: /^Auto-caption/ })).toBeEnabled();
  });

  it("shows why unavailable tools are disabled in Tools and Quick actions", async () => {
    const user = userEvent.setup();
    const { panel, onRequestStart } = renderActions(
      {},
      {
        availability: {
          syspromptApplies: false,
          hasCaptionBackup: false,
          ostrisAvailable: false,
          comfyPresetsAvailable: false,
        },
      },
    );
    await user.click(screen.getByRole("button", { name: "Tools" }));
    const drawer = screen.getByRole("menu", { name: "Tools" });
    const commands = buildRunJobItems({ startContext: panel.startContext, onRequestStart });
    const unavailable = [
      ["auto_caption", "Create folder instructions to enable auto-captioning."],
      ["train_lora", "AI-Toolkit is unavailable"],
      ["comfy_process", "No ComfyUI"],
      ["restore_captions", "No caption backup in this folder."],
    ] as const;
    for (const [type, reason] of unavailable) {
      const item = within(drawer).getByText(jobMenuLabelFor(type)).closest("button");
      expect(item).toBeDisabled();
      expect(item).toHaveTextContent(reason);
      const command = commands.find((item) => item.id === quickActionRunJobId(type))!;
      expect(command.disabled).toBe(true);
      expect(command.detail).toContain(reason);
    }
  });
});
