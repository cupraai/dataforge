import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { WORKSPACE } from "./workspace";

const backend = fileURLToPath(new URL("../../backend/", import.meta.url));
const python = path.join(
  backend,
  ".venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);

/** The stand-in ComfyUI in scripts/e2e_backend.py paints every fill this color. */
const FILL_COLOR = [255, 0, 255];
const BACKGROUND = [40, 90, 140];

/** A folder of its own with one flat image, so no other spec's edits reach it. */
async function sceneFolder(): Promise<string> {
  await mkdir(WORKSPACE, { recursive: true });
  const folder = await mkdtemp(path.join(WORKSPACE, "fill-"));
  execFileSync(python, [
    "-c",
    "import sys; from PIL import Image; " +
      `Image.new('RGB', (480, 320), (${BACKGROUND.join(", ")})).save(sys.argv[1])`,
    path.join(folder, "scene.png"),
  ]);
  return folder;
}

function pixel(file: string, x: number, y: number): number[] {
  const output = execFileSync(python, [
    "-c",
    "import sys, json; from PIL import Image; " +
      "image = Image.open(sys.argv[1]).convert('RGB'); " +
      "print(json.dumps(image.getpixel((int(sys.argv[2]), int(sys.argv[3])))))",
    file,
    String(x),
    String(y),
  ]);
  return JSON.parse(output.toString()) as number[];
}

function comfyStops(): { path: string }[] {
  const log = path.join(WORKSPACE, "comfy-stops.json");
  return fs.existsSync(log)
    ? (JSON.parse(fs.readFileSync(log, "utf-8")) as { path: string }[])
    : [];
}

async function openFill(page: Page, folder: string) {
  await page.goto(`/?path=${encodeURIComponent(folder)}`);
  await page.getByRole("button", { name: "View scene.png" }).click();
  await page.getByRole("button", { name: "Edit scene.png" }).click();
  await page.getByRole("button", { name: /^Fill/ }).click();
  return page;
}

/** Drags across the middle of the picture, in screen pixels of the painted frame. */
async function paintMiddle(page: Page) {
  const surface = page.getByTestId("fill-overlay");
  const box = await surface.boundingBox();
  if (!box) throw new Error("The brush surface is not laid out");
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(x - 20, y);
  await page.mouse.down();
  await page.mouse.move(x + 20, y, { steps: 6 });
  await page.mouse.up();
}

test("paints, generates, compares, keeps, applies and reopens a fill", async ({
  page,
}, testInfo) => {
  const folder = await sceneFolder();
  const dialog = await openFill(page, folder);
  // The fill tool's own status, apart from the app's refresh indicator.
  const status = dialog.locator(".stage-hint").getByRole("status");
  const generate = dialog.getByRole("button", { name: "Generate" });

  await expect(status).toHaveText("Paint over what you want to change.");
  // The hint sits over the picture and clears while the pointer is over it.
  const hint = dialog.locator(".stage-hint");
  const hintBox = await hint.boundingBox();
  if (!hintBox) throw new Error("The hint is not laid out");
  await page.mouse.move(hintBox.x + hintBox.width / 2, hintBox.y + hintBox.height / 2);
  await expect(hint).toHaveClass(/stage-hint--clear/);
  await page.mouse.move(hintBox.x + hintBox.width / 2, hintBox.y - 120);
  await expect(hint).not.toHaveClass(/stage-hint--clear/);
  await expect(dialog.getByRole("textbox", { name: "Instruction" })).toHaveValue("");
  await expect(generate).toBeDisabled();
  await paintMiddle(page);
  await generate.click();

  await expect(status).toHaveText(/Queued in ComfyUI|Generating/);
  const keep = dialog.getByRole("button", { name: "Keep fill" });
  await expect(keep).toBeVisible({ timeout: 15_000 });
  const stage = dialog.locator("img.image-edit-stage__img");
  await expect(stage).toHaveAttribute(
    "src",
    /\/api\/media\/image-fill\/preview\?.*fills=[0-9a-f]{32}/,
  );
  await expect(dialog.getByRole("button", { name: "Apply" })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath("fill-result.png") });

  const before = dialog.getByRole("button", { name: "Before" });
  await before.click();
  await expect(before).toHaveAttribute("aria-pressed", "true");
  await expect(stage).toHaveAttribute("src", /original=1/);
  await before.click();
  await expect(stage).toHaveAttribute("src", /image-fill\/preview/);

  // Holding the picture shows it before, for as long as the button is down.
  const surface = await page.getByTestId("fill-overlay").boundingBox();
  if (!surface) throw new Error("The brush surface is not laid out");
  await page.mouse.move(surface.x + surface.width / 2, surface.y + surface.height / 2);
  await page.mouse.down();
  await expect(stage).toHaveAttribute("src", /original=1/);
  await page.mouse.up();
  await expect(stage).toHaveAttribute("src", /image-fill\/preview/);

  await keep.click();
  await expect(dialog.getByText("1 fill")).toBeVisible();
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Edited scene.png", { exact: false })).toBeVisible();

  const file = path.join(folder, "scene.png");
  expect(pixel(file, 240, 160)).toEqual(FILL_COLOR);
  // Outside the context crop and its blend nothing moves, not even by a rounding step.
  expect(pixel(file, 2, 2)).toEqual(BACKGROUND);
  expect(fs.existsSync(`${file}.fills`)).toBe(true);

  // Reopened, the saved fill is part of the picture every tool works on.
  await dialog.getByRole("button", { name: "Exit image editing for scene.png" }).click();
  await dialog.getByRole("button", { name: "Edit scene.png" }).click();
  await expect(dialog.getByRole("button", { name: "Fill, changed" })).toBeVisible();
  await expect(dialog.locator("img.image-edit-stage__img")).toHaveAttribute(
    "src",
    /image-fill\/preview/,
  );
});

test("cancels a running fill, and asks before leaving an undecided one", async ({ page }) => {
  const folder = await sceneFolder();
  const dialog = await openFill(page, folder);
  // The fill tool's own status, apart from the app's refresh indicator.
  const status = dialog.locator(".stage-hint").getByRole("status");
  const stopsBefore = comfyStops().length;

  await paintMiddle(page);
  // The stand-in never finishes a prompt that asks for something slow.
  await dialog.getByRole("textbox", { name: "Instruction" }).fill("a slow red bench");
  await dialog.getByRole("button", { name: "Generate" }).click();
  const cancel = dialog.getByRole("button", { name: "Cancel" });
  await expect(status).toHaveText("Generating...", { timeout: 15_000 });
  await cancel.click();

  await expect(dialog.getByRole("button", { name: "Generate" })).toBeEnabled({ timeout: 15_000 });
  expect(
    comfyStops()
      .slice(stopsBefore)
      .map((stop) => stop.path),
  ).toEqual(["/interrupt"]);

  // Enter in the instruction generates, so a reworded request needs no trip to the button.
  await dialog.getByRole("textbox", { name: "Instruction" }).fill("a red bench");
  await dialog.getByRole("textbox", { name: "Instruction" }).press("Enter");
  await expect(dialog.getByRole("button", { name: "Keep fill" })).toBeVisible({ timeout: 15_000 });

  await dialog.getByRole("button", { name: "Exit image editing for scene.png" }).click();
  const confirmation = page.getByRole("alertdialog", { name: "Discard changes?" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Edit scene.png" })).toBeVisible();
  // Nothing was applied, so the file is untouched.
  expect(pixel(path.join(folder, "scene.png"), 240, 160)).toEqual(BACKGROUND);
});

test("narrow: the fill row scrolls and its status stays on the stage", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const folder = await sceneFolder();
  const dialog = await openFill(page, folder);

  await paintMiddle(page);
  await expect(dialog.locator(".stage-hint").getByRole("status")).toHaveText(
    /leave the instruction blank to remove/,
  );
  const stageBox = await dialog.locator(".gallery-item-dialog__stage").boundingBox();
  const statusBox = await dialog.locator(".stage-hint").boundingBox();
  if (!stageBox || !statusBox) throw new Error("The stage is not laid out");
  expect(statusBox.x).toBeGreaterThanOrEqual(stageBox.x);
  expect(statusBox.x + statusBox.width).toBeLessThanOrEqual(stageBox.x + stageBox.width);
  expect(statusBox.y + statusBox.height).toBeLessThanOrEqual(stageBox.y + stageBox.height);
  const controls = dialog.locator(".edit-panel__tool-controls");
  const overflow = await controls.evaluate((element) => element.scrollWidth > element.clientWidth);
  expect(overflow).toBe(true);
  // The page itself never scrolls sideways; only the tool row does.
  const pageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(pageOverflow).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("fill-narrow.png") });
});

test("the fill tool keeps the panel's height, so the picture does not move", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const folder = await sceneFolder();
  await page.goto(`/?path=${encodeURIComponent(folder)}`);
  await page.getByRole("button", { name: "View scene.png" }).click();
  await page.getByRole("button", { name: "Edit scene.png" }).click();
  const panel = page.locator(".edit-panel");
  const height = async () => (await panel.boundingBox())?.height;

  await page.getByRole("button", { name: /^Fill/ }).click();
  await expect(page.getByRole("button", { name: "Generate" })).toBeVisible();
  // Polled: the panel fades in, and a box read mid-animation is not its height.
  await expect.poll(height).toBe(await height());
  const fillHeight = await height();
  // Every group's caption on one line, however short its controls are.
  const captionTops = await panel
    .locator(".edit-panel__group-label")
    .evaluateAll((labels) => labels.map((label) => label.getBoundingClientRect().top));
  expect(new Set(captionTops).size).toBe(1);

  await page.getByRole("button", { name: /^Crop/ }).click();
  await expect(page.getByRole("group", { name: "Aspect" })).toBeVisible();
  await expect.poll(height).toBe(fillHeight);
});

test("zooms with the wheel, pans with the middle button, and paints where the pointer is", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const folder = await sceneFolder();
  const dialog = await openFill(page, folder);
  const canvas = page.locator(".image-edit-stage__canvas");
  const zoomVar = (name: string) =>
    canvas.evaluate((element, key) => (element as HTMLElement).style.getPropertyValue(key), name);
  const surface = page.getByTestId("fill-overlay");
  const before = await surface.boundingBox();
  if (!before) throw new Error("The brush surface is not laid out");
  // A point right of and below the middle: 3/4 across and 3/4 down the 480 x 320 picture.
  const target = { x: before.x + before.width * 0.75, y: before.y + before.height * 0.75 };

  await page.mouse.move(target.x, target.y);
  await page.mouse.wheel(0, -500);
  await expect.poll(async () => Number(await zoomVar("--edit-zoom"))).toBeGreaterThan(2);
  // The picture point under the pointer stayed under it.
  const zoomed = await surface.boundingBox();
  expect((target.x - zoomed!.x) / zoomed!.width).toBeCloseTo(0.75, 2);
  expect((target.y - zoomed!.y) / zoomed!.height).toBeCloseTo(0.75, 2);

  // Alt+wheel sizes the brush and leaves the zoom alone.
  const size = dialog.getByRole("slider", { name: "Brush size" });
  const sizeBefore = Number(await size.inputValue());
  const zoomBefore = await zoomVar("--edit-zoom");
  await page.keyboard.down("Alt");
  await page.mouse.wheel(0, 100);
  await page.keyboard.up("Alt");
  await expect.poll(async () => Number(await size.inputValue())).toBeLessThan(sizeBefore);
  expect(await zoomVar("--edit-zoom")).toBe(zoomBefore);

  // Keys pick the tool; paint with the brush.
  await page.keyboard.press("e");
  await expect(dialog.getByRole("button", { name: "Erase" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("b");
  await expect(dialog.getByRole("button", { name: "Paint" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // Away from the zoom's anchor, where only a mapping that honours the zoom finds the pixel.
  const stroke = { x: target.x + 100, y: target.y };
  const zoomedSource = {
    x: Math.round(((stroke.x - zoomed!.x) / zoomed!.width) * 480),
    y: Math.round(((stroke.y - zoomed!.y) / zoomed!.height) * 320),
  };
  const unzoomedSource = {
    x: Math.round(((stroke.x - before.x) / before.width) * 480),
    y: Math.round(((stroke.y - before.y) / before.height) * 320),
  };
  expect(unzoomedSource.x - zoomedSource.x).toBeGreaterThan(30);
  await page.mouse.move(stroke.x - 4, stroke.y);
  await page.mouse.down();
  await page.mouse.move(stroke.x + 4, stroke.y, { steps: 3 });
  await page.mouse.up();

  // A middle-button drag pans by what the pointer moved.
  const panBefore = parseFloat(await zoomVar("--edit-pan-x"));
  await page.mouse.move(target.x, target.y);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(target.x + 60, target.y, { steps: 4 });
  await page.mouse.up({ button: "middle" });
  await expect
    .poll(async () => parseFloat(await zoomVar("--edit-pan-x")))
    .toBeCloseTo(panBefore + 60, 0);

  // ] grows the brush; Fit returns to the whole picture.
  const sizeNow = Number(await size.inputValue());
  await page.keyboard.press("]");
  await expect.poll(async () => Number(await size.inputValue())).toBeGreaterThan(sizeNow);
  await expect(dialog.getByText(/^\d{3}%$/)).toBeVisible();
  await dialog.getByRole("button", { name: "Fit" }).click();
  await expect.poll(async () => Number(await zoomVar("--edit-zoom"))).toBe(1);
  await expect(dialog.getByRole("button", { name: "Fit" })).toBeHidden();

  await dialog.getByRole("button", { name: "Generate" }).click();
  await dialog.getByRole("button", { name: "Keep fill" }).click({ timeout: 15_000 });
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Edited scene.png", { exact: false })).toBeVisible();

  const file = path.join(folder, "scene.png");
  expect(pixel(file, zoomedSource.x, zoomedSource.y)).toEqual(FILL_COLOR);
  expect(pixel(file, unzoomedSource.x, unzoomedSource.y)).toEqual(BACKGROUND);
});
