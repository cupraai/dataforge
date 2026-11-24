import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import type { AutomationActions } from "@/features/automation/lib/automationActions";
import {
  JOB_TYPE_META,
  JOB_TYPES,
  jobMenuLabelFor,
  type JobStartContext,
} from "@/features/jobs/lib/jobMeta";
import {
  buildRunJobItems,
  quickActionRunJobId,
} from "@/features/quickAction/lib/buildQuickActionItems";
import {
  COLLAPSIBLE_LABEL_CLASS,
  ToolbarCompactContext,
} from "@/features/gallery/lib/toolbarCompact";
import { job } from "@/test/fixtures";
import { installMockBackend } from "@/test/mockBackend";
import { renderWithQueryClient } from "@/test/queryClient";
import { WorkspaceActions, WorkspaceActivity } from "./WorkspaceActions";
import { SystemSpecsButton } from "@/features/automation/components/SystemSpecsButton";
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
        comfyRunPresetsAvailable: true,
        comfyShowcasePresetsAvailable: true,
      },
      ...context,
    },
    onEditSysprompt: vi.fn<() => void>(),
    onRequestStart,
    onCancelJob: vi.fn<() => void>(),
    ...overrides,
  };
  const tree = (current: AutomationActions) => (
    <ToolbarCompactContext.Provider value={compact}>
      <WorkspaceActions panel={current} />
      {/* Lives in the toolbar's app-wide group; the strip it opens is part of the activity. */}
      <SystemSpecsButton />
      <WorkspaceActivity panel={current} />
    </ToolbarCompactContext.Provider>
  );
  const { unmount, rerender } = renderWithQueryClient(tree(panel));
  const update = (next: Partial<AutomationActions>) => rerender(tree({ ...panel, ...next }));
  return { panel, onRequestStart, unmount, update };
}

describe("Workspace tools", () => {
  it("keeps the folder actions' names when a crowded toolbar shows only their icons", async () => {
    const user = userEvent.setup();
    renderActions({}, {}, true);

    const tools = screen.getByRole("button", { name: "Tools" });
    await user.hover(tools);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Tools");
  });

  it("folds Review with the other menus, keeping its count, and drops every chevron with the labels", async () => {
    const user = userEvent.setup();
    renderActions({ issueCount: 2, onResolveIssues: vi.fn<() => void>() }, {}, true);

    const review = screen.getByRole("button", { name: "Review 2" });
    expect(review.querySelector(`.${COLLAPSIBLE_LABEL_CLASS}`)).toHaveTextContent(/^Review$/);
    expect(review.querySelector(".workspace-actions__count")).not.toHaveClass(
      COLLAPSIBLE_LABEL_CLASS,
    );
    await user.hover(review);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Review");

    for (const name of ["Tools", "Workflows", "Review 2"]) {
      const button = screen.getByRole("button", { name });
      // The trailing chevron is the button's last child, inside a label the compact toolbar hides.
      expect(button.lastElementChild).toHaveClass(COLLAPSIBLE_LABEL_CLASS);
      expect(button.lastElementChild?.querySelector("svg")).not.toBeNull();
    }
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
    // The strip shrinks closed still showing the job, then leaves.
    const strip = screen.getByRole("status").closest(".collapse")!;
    expect(strip).toHaveClass("collapse--exit");
    expect(screen.getByRole("alert")).toHaveTextContent("Disk is full.");
    fireEvent.animationEnd(strip);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shrinks the strip closed on the last job it showed when the job goes away", () => {
    const { update } = renderActions({
      job: job({ status: "running", processed: 3, total: 8 }),
    });
    expect(screen.getByRole("status")).toHaveTextContent("3 of 8");

    update({ job: null });
    const strip = screen.getByRole("status").closest(".collapse")!;
    expect(strip).toHaveClass("collapse--exit");
    expect(screen.getByRole("status")).toHaveTextContent("3 of 8");
    fireEvent.animationEnd(strip);
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
    // Shrinks closed first: the strip leaves when its exit animation ends.
    const strip = screen
      .getByRole("region", { name: "System specifications" })
      .closest(".collapse")!;
    expect(strip).toHaveClass("collapse--exit");
    fireEvent.animationEnd(strip);
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
    for (const name of [/^Run ComfyUI workflow/, /^LoRA training/]) {
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

  it("names each tool by its title and describes it in a tooltip", async () => {
    const user = userEvent.setup();
    renderActions();
    await user.click(screen.getByRole("button", { name: "Tools" }));
    const item = screen.getByRole("menuitem", { name: "Auto-caption" });
    expect(item).toHaveTextContent(/^Auto-caption$/);

    await user.hover(item);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      JOB_TYPE_META.auto_caption.menuDescription,
    );
  });

  it("names the scope under Tools, Workflows and Review", async () => {
    const user = userEvent.setup();
    renderActions({
      reviewScope: { kind: "selected", fileCount: 3 },
      issueCount: 1,
      workflows: {
        workflows: [{ name: "Tidy", steps: [{ job_type: "strip_metadata", settings: {} }] }],
        startingWorkflow: null,
        onRunWorkflow: vi.fn<(name: string) => void>(),
        onEditWorkflows: vi.fn<(name: string | null) => void>(),
      },
    });
    const menus = [
      ["Tools", "Tools"],
      ["Workflows", "Workflows"],
      [/^Review/, "Review queues"],
    ] as const;
    for (const [button, menu] of menus) {
      await user.click(screen.getByRole("button", { name: button }));
      expect(screen.getByRole("menu", { name: menu })).toHaveTextContent("Scope3 selected files");
      await user.keyboard("{Escape}");
    }
  });

  it("moves between tool groups with Left and Right, past disabled tools", async () => {
    const user = userEvent.setup();
    renderActions(
      {},
      {
        availability: {
          syspromptApplies: true,
          hasCaptionBackup: false,
          comfyRunPresetsAvailable: false,
          comfyShowcasePresetsAvailable: false,
        },
      },
    );
    await user.click(screen.getByRole("button", { name: "Tools" }));
    const focusTool = (name: string) => {
      act(() => {
        screen.getByRole("menuitem", { name }).focus();
      });
    };

    focusTool("Auto-caption");
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("menuitem", { name: "Verify captions" })).toHaveFocus();

    // Check has three tools, so the fourth row lands on its last.
    focusTool("Edit captions");
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("menuitem", { name: "Find duplicates" })).toHaveFocus();

    // Restore captions is disabled; its nearest enabled neighbour takes focus.
    focusTool("Split into clips");
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("menuitem", { name: "Backup captions" })).toHaveFocus();

    // LoRA training is the only enabled integration, so Right from Files lands on it.
    focusTool("Rename");
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("menuitem", { name: "LoRA training" })).toHaveFocus();
    // The last group wraps to Captions.
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("menuitem", { name: "Find & replace" })).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("menuitem", { name: "LoRA training" })).toHaveFocus();
  });

  it("shows why unavailable tools are disabled in Tools and Quick actions", async () => {
    const user = userEvent.setup();
    const { panel, onRequestStart } = renderActions(
      {},
      {
        availability: {
          syspromptApplies: false,
          hasCaptionBackup: false,
          comfyRunPresetsAvailable: false,
          comfyShowcasePresetsAvailable: false,
        },
      },
    );
    await user.click(screen.getByRole("button", { name: "Tools" }));
    const drawer = screen.getByRole("menu", { name: "Tools" });
    const commands = buildRunJobItems({ startContext: panel.startContext, onRequestStart });
    const unavailable = [
      ["auto_caption", "Create folder instructions to enable auto-captioning."],
      ["comfy_run", "No ComfyUI"],
      ["restore_captions", "No caption backup in this folder."],
    ] as const;
    for (const [type, reason] of unavailable) {
      const item = within(drawer).getByText(jobMenuLabelFor(type)).closest("button");
      expect(item).toBeDisabled();
      const command = commands.find((item) => item.id === quickActionRunJobId(type))!;
      expect(command.disabled).toBe(true);
      expect(command.detail).toContain(reason);
    }
    // AI-Toolkit is checked in the dialog instead, which opens but cannot start without it.
    expect(within(drawer).getByText(jobMenuLabelFor("train_lora")).closest("button")).toBeEnabled();
    // A disabled button gets no pointer events, so the hover lands on the tooltip wrapper.
    const blocked = within(drawer).getByText(jobMenuLabelFor("comfy_run")).closest("button")!;
    await user.hover(blocked.parentElement!);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("No ComfyUI workflow presets");
  });
});
