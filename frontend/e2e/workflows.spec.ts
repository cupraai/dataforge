import { expect, test, type Page } from "@playwright/test";
import type { Job, Workflow } from "../src/shared/types";
import { WORKSPACE, openWorkspace } from "./workspace";

const workflow: Workflow = {
  name: "Dataset prep",
  steps: [
    {
      job_type: "resize",
      settings: { megapixels: 1, multiple: 32, frame_rate: 24, reset_size: false },
    },
    { job_type: "strip_metadata", settings: {} },
    {
      job_type: "edit_captions",
      settings: {
        mode: "instruct",
        reasoning_effort: "medium",
        preserve_thinking: true,
        instruction: "Rewrite every caption in the present tense and drop camera jargon.",
        vision: false,
        backup: true,
      },
    },
    { job_type: "find_duplicates", settings: { threshold: "near" } },
  ],
};

function job(id: string, jobType: Job["job_type"], status: Job["status"], createdAt: string): Job {
  return {
    id,
    folder: WORKSPACE,
    folder_name: "workspace",
    job_type: jobType,
    status,
    effective_status: status,
    warning: null,
    total: 48,
    processed: status === "running" ? 16 : 0,
    current_name: status === "running" ? "photo.png" : null,
    stats: {},
    error: null,
    external_ref: null,
    workflow: null,
    workflow_edited: false,
    undoable: false,
    created_at: createdAt,
    started_at: status === "running" ? createdAt : null,
    finished_at: null,
    revision: 1,
    workflow_run: { id: "run", name: workflow.name, step: 1, steps: 3 },
  };
}

async function routeWorkflows(page: Page, jobs: Job[] = []) {
  await page.route("**/api/workflows", (route) =>
    route.fulfill({ json: { workflows: [workflow] } }),
  );
  await page.route("**/api/jobs?**", (route) =>
    route.fulfill({
      json: { jobs, active_count: jobs.length, total: jobs.length, revision: 2 },
    }),
  );
}

async function expectInsideViewport(page: Page, selector: string) {
  const box = (await page.locator(selector).boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

for (const [width, height] of [
  [1440, 900],
  [1024, 720],
]) {
  test(`workflow editor and run dialog at ${width}x${height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await routeWorkflows(page);
    await openWorkspace(page);

    await page.getByRole("button", { name: "Workflows", exact: true }).click();
    const menu = page.getByRole("menu", { name: "Workflows" });
    await expect(menu).not.toContainText("Runs on");
    await expectInsideViewport(page, ".workspace-workflows");
    await menu.getByRole("menuitem", { name: /^Run Dataset prep/ }).hover();
    await page.screenshot({ animations: "disabled", path: testInfo.outputPath("menu.png") });
    await menu.getByRole("menuitem", { name: "Manage", exact: true }).click();

    const editor = page.getByRole("dialog", { name: "Workflows" });
    await expect(editor.getByRole("list", { name: "Steps" }).getByRole("listitem")).toHaveCount(4);
    await expectInsideViewport(page, ".workflow-editor__panel");
    // The panel never scrolls; the step list and the library take the extra height.
    expect(
      await page
        .locator(".workflow-editor__panel")
        .evaluate((node) => node.scrollHeight <= node.clientHeight + 1),
    ).toBe(true);
    await expect(editor.getByRole("button", { name: "Close", exact: true })).toBeVisible();
    await expect(editor.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0);
    await page.screenshot({ animations: "disabled", path: testInfo.outputPath("editor.png") });

    await editor.getByRole("button", { name: "Run...", exact: true }).click();
    const run = page.getByRole("dialog", { name: "Run workflow?" });
    await expect(run.getByRole("list", { name: "Steps" }).getByRole("listitem")).toHaveCount(4);
    await expectInsideViewport(page, ".workflow-run-dialog");
    await page.screenshot({ animations: "disabled", path: testInfo.outputPath("run.png") });
  });
}

test("a queued job card reads as waiting, not running", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await routeWorkflows(page, [
    job("running", "resize", "running", "2026-01-01T00:00:00.000Z"),
    job("next", "strip_metadata", "queued", "2026-01-01T00:00:01.000Z"),
    job("later", "find_duplicates", "queued", "2026-01-01T00:00:02.000Z"),
  ]);
  await openWorkspace(page);

  await page.getByRole("button", { name: /^Open automation jobs/ }).click();
  const next = page.getByRole("article", { name: /^Strip metadata job/ });
  await expect(next).toContainText("Starts after Resize");
  await expect(next).toContainText("Next up");
  await expect(next.getByRole("progressbar")).toHaveCount(0);
  await expect(page.getByRole("article", { name: /^Find duplicates job/ })).toContainText(
    "2nd in line",
  );
  await page.screenshot({ animations: "disabled", path: testInfo.outputPath("queued.png") });
});

test("the Workflows menu invites the first workflow when there are none", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/api/workflows", (route) => route.fulfill({ json: { workflows: [] } }));
  await openWorkspace(page);

  await page.getByRole("button", { name: "Workflows", exact: true }).click();
  const menu = page.getByRole("menu", { name: "Workflows" });
  await expect(menu).toContainText("No workflows yet");
  await page.screenshot({ animations: "disabled", path: testInfo.outputPath("menu-empty.png") });
  await menu.getByRole("menuitem", { name: "Create a workflow" }).click();
  await expect(page.getByRole("dialog", { name: "Workflows" })).toBeVisible();
});
