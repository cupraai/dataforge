import path from "node:path";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { WORKSPACE } from "./workspace";

test("previews inherited instructions, customizes locally, and restores inheritance", async ({
  page,
}, testInfo) => {
  const parent = testInfo.outputPath("dataset");
  const child = path.join(parent, "portraits");
  mkdirSync(child, { recursive: true });
  const prompt = "# Caption instructions\n\nDescribe the main subject and the setting.\n";
  writeFileSync(path.join(parent, ".sysprompt"), prompt);
  writeFileSync(path.join(parent, ".captionrules"), "words:\n  min: 8\n");
  copyFileSync(path.join(WORKSPACE, "photo.png"), path.join(child, "photo.png"));
  await page.goto(`/?path=${encodeURIComponent(child)}`);
  await expect(page.getByLabel(/System prompt: Inherited:/)).toBeVisible();
  await page.getByRole("button", { name: "Create instructions", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Folder instructions" });
  const editor = dialog.getByRole("textbox", { name: "System prompt" });
  await expect(dialog.getByText(child, { exact: true })).toBeVisible();
  await expect(editor).toHaveText(prompt.trim(), { useInnerText: true });
  await expect(editor).toHaveAttribute("contenteditable", "false");
  await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await page.screenshot({
    path: testInfo.outputPath("inherited-desktop.png"),
    animations: "disabled",
  });
  await dialog.getByRole("tab", { name: "System prompt" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByRole("tab", { name: "Caption rules" })).toBeFocused();
  await expect(dialog.getByRole("textbox", { name: "Caption rules" })).toHaveText(
    "words:\n  min: 8",
    { useInnerText: true },
  );
  await page.keyboard.press("ArrowLeft");
  await dialog.getByRole("button", { name: "Customize for this folder" }).click();
  await expect(editor).toBeEditable();
  await editor.fill("## An invalid opening heading");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("must start with a non-empty # heading");
  expect(existsSync(path.join(child, ".sysprompt"))).toBe(false);
  await editor.fill("# Describe the subject in detail.");
  expect(existsSync(path.join(child, ".sysprompt"))).toBe(false);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(readFileSync(path.join(parent, ".sysprompt"), "utf-8")).toBe(prompt);
  expect(readFileSync(path.join(child, ".sysprompt"), "utf-8").replaceAll("\r\n", "\n")).toBe(
    "# Describe the subject in detail.\n",
  );
  await page.getByRole("button", { name: "Edit instructions", exact: true }).click();
  await dialog.getByRole("button", { name: "Use inherited instructions" }).click();
  await expect(editor).toHaveText(prompt.trim(), { useInnerText: true });
  await dialog.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(editor).toHaveText("# Describe the subject in detail.");
  await dialog.getByRole("button", { name: "Use inherited instructions" }).click();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(existsSync(path.join(child, ".sysprompt"))).toBe(false);
  expect(existsSync(path.join(child, ".captionrules"))).toBe(false);
});

test("shows invalid and missing instructions on a narrow screen", async ({ page }, testInfo) => {
  const folder = testInfo.outputPath(
    "dataset",
    "nested",
    "a-long-folder-name-for-caption-instructions",
  );
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, ".captionrules"), "unknown: value\n");
  await page.setViewportSize({ width: 390, height: 740 });
  await page.goto(`/?path=${encodeURIComponent(folder)}`);
  await page.getByRole("button", { name: "Edit instructions", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Folder instructions" });
  await expect(dialog.getByText("No system prompt yet", { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Create instructions", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("missing-narrow.png"),
    animations: "disabled",
  });
  await dialog.getByRole("tab", { name: "Caption rules" }).click();
  await expect(dialog.getByRole("alert")).toContainText("unknown setting");
  await expect(dialog.getByText("Invalid", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Caption rules" })).toBeEditable();
  await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("invalid-narrow.png"),
    animations: "disabled",
  });
});

test("retries an unreadable source while keeping the other tab available", async ({
  page,
}, testInfo) => {
  const folder = testInfo.outputPath("dataset");
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, ".sysprompt"), Buffer.from([0xff]));
  writeFileSync(path.join(folder, ".captionrules"), "trigger: example\n");
  await page.goto(`/?path=${encodeURIComponent(folder)}`);
  await page.getByRole("button", { name: "Edit instructions", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Folder instructions" });
  await expect(dialog.getByText("Unreadable", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText("UTF-8");
  await dialog.getByRole("tab", { name: "Caption rules" }).click();
  await expect(dialog.getByRole("textbox", { name: "Caption rules" })).toHaveText(
    "trigger: example",
  );
  await dialog.getByRole("tab", { name: "System prompt" }).click();
  writeFileSync(path.join(folder, ".sysprompt"), "# Describe the scene.\n");
  await dialog.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "System prompt" })).toHaveText(
    "# Describe the scene.",
  );
  await expect(dialog.getByText("Unreadable", { exact: true })).toHaveCount(0);
});
