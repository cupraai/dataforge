import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOME_PATH } from "@/test/fixtures";
import { makeImageFill } from "@/test/fillControls";
import { makeItem } from "@/test/galleryItemDialog";
import { installMockBackend } from "@/test/mockBackend";
import { renderWithProviders } from "@/test/renderWithProviders";
import { stubImageElement } from "@/test/imageElement";
import type { CaptionSaveResponse, ImageEditResponse } from "@/shared/types";
import type * as imageEditApi from "@/features/gallery/api/imageEdit";
import type * as imageFillApi from "@/features/gallery/api/imageFill";
import { applyImageEdit, fetchImageEditState } from "@/features/gallery/api/imageEdit";
import {
  cancelFillOperation,
  discardFillResult,
  fetchFillOperation,
  fetchFillPresets,
  startImageFill,
} from "@/features/gallery/api/imageFill";
import { rasterizeFillMask } from "@/features/gallery/lib/fillMask";
import type * as fillMaskLib from "@/features/gallery/lib/fillMask";
import { FILL_POLL_INTERVAL_MS } from "@/features/gallery/hooks/useImageFill";
import { GalleryItemDialog } from "./GalleryItemDialog";

vi.mock("@/shared/lib/defer", () => ({
  deferNonCriticalWork: (callback: () => void) => {
    callback();
    return () => {};
  },
}));

vi.mock("@/features/gallery/api/imageEdit", async (importOriginal) => ({
  ...(await importOriginal<typeof imageEditApi>()),
  fetchImageEditState: vi.fn<typeof fetchImageEditState>(),
  applyImageEdit: vi.fn<typeof applyImageEdit>(),
}));

vi.mock("@/features/gallery/api/imageFill", async (importOriginal) => ({
  ...(await importOriginal<typeof imageFillApi>()),
  fetchFillPresets: vi.fn<typeof fetchFillPresets>(),
  startImageFill: vi.fn<typeof startImageFill>(),
  fetchFillOperation: vi.fn<typeof fetchFillOperation>(),
  cancelFillOperation: vi.fn<typeof cancelFillOperation>(),
  discardFillResult: vi.fn<typeof discardFillResult>(),
}));

vi.mock("@/features/gallery/lib/fillMask", async (importOriginal) => ({
  ...(await importOriginal<typeof fillMaskLib>()),
  rasterizeFillMask: vi.fn<typeof rasterizeFillMask>(),
}));

const PHOTO = `${HOME_PATH}\\sunset.png`;
const FILL = makeImageFill({ id: "f".repeat(32) });

const EDITED: ImageEditResponse = {
  path: PHOTO,
  size: 2048,
  modified_at: "2026-03-15T15:00:00.000Z",
  width: 1920,
  height: 1080,
  has_backup: true,
  replaced_externally: false,
};

class PointerEventPolyfill extends MouseEvent {
  readonly pointerId: number;

  constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
  }
}

describe("GalleryItemDialog", () => {
  describe("generative fill", () => {
    let restoreImage: (() => void) | undefined;

    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.stubGlobal("PointerEvent", PointerEventPolyfill);
      const captured = new Set<Element>();
      Element.prototype.setPointerCapture = function (this: Element) {
        captured.add(this);
      };
      Element.prototype.releasePointerCapture = function (this: Element) {
        captured.delete(this);
      };
      Element.prototype.hasPointerCapture = function (this: Element) {
        return captured.has(this);
      };
      installMockBackend();
      restoreImage = stubImageElement({ width: 1920, height: 1080 });
      vi.mocked(fetchImageEditState).mockReset().mockResolvedValue({
        path: PHOTO,
        has_backup: false,
        spec: null,
      });
      vi.mocked(applyImageEdit).mockReset().mockResolvedValue(EDITED);
      vi.mocked(fetchFillPresets)
        .mockReset()
        .mockResolvedValue({
          presets: [
            { preset: "fast", available: true, reason: null },
            { preset: "quality", available: true, reason: null },
          ],
        });
      vi.mocked(startImageFill)
        .mockReset()
        .mockResolvedValue({ id: FILL.id, path: PHOTO, status: "queued", preset: "quality" });
      vi.mocked(fetchFillOperation).mockReset().mockResolvedValue({
        id: FILL.id,
        path: PHOTO,
        status: "succeeded",
        preset: "quality",
        fill: FILL,
      });
      vi.mocked(cancelFillOperation)
        .mockReset()
        .mockResolvedValue({ id: FILL.id, path: PHOTO, status: "cancelled", preset: "quality" });
      vi.mocked(discardFillResult).mockReset().mockResolvedValue(undefined);
      vi.mocked(rasterizeFillMask).mockReset().mockResolvedValue("bWFzaw==");
    });

    afterEach(() => {
      restoreImage?.();
      restoreImage = undefined;
      vi.unstubAllGlobals();
      vi.useRealTimers();
    });

    function renderDialog() {
      const props = {
        items: [makeItem("sunset.png")],
        index: 0,
        currentFolder: HOME_PATH,
        onClose: vi.fn<() => void>(),
        onPrevious: vi.fn<() => void>(),
        onNext: vi.fn<() => void>(),
        onCaptionSaved: vi.fn<(path: string, update: CaptionSaveResponse) => void>(),
        onCopied: vi.fn<() => void | Promise<void>>(),
      };
      renderWithProviders(<GalleryItemDialog {...props} />);
      return props;
    }

    async function openFillTool(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
      // The tools unlock once the saved edit has been read.
      const tab = within(dialog).getByRole("button", { name: "Fill" });
      await waitFor(() => expect(tab).toBeEnabled());
      await user.click(tab);
    }

    async function generateFill() {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const props = renderDialog();
      const dialog = await screen.findByRole("dialog", { name: "Viewing sunset.png" });
      await user.click(within(dialog).getByRole("button", { name: "Edit sunset.png" }));
      fireEvent.load(dialog.querySelector("img")!);
      await openFillTool(user, dialog);

      const overlay = await within(dialog).findByTestId("fill-overlay");
      fireEvent.pointerDown(overlay, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
      fireEvent.pointerUp(overlay, { pointerId: 1 });
      const generate = within(dialog).getByRole("button", { name: "Generate" });
      await waitFor(() => expect(generate).toBeEnabled());
      await user.click(generate);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(FILL_POLL_INTERVAL_MS);
      });
      await within(dialog).findByRole("button", { name: "Keep fill" });
      return { user, dialog, props };
    }

    it("keeps a generated fill into the draft and applies it without generating again", async () => {
      const { user, dialog } = await generateFill();
      const stage = () => dialog.querySelector<HTMLImageElement>(".image-edit-stage__img")!;
      expect(stage().getAttribute("src")).toContain(`/api/media/image-fill/preview?`);
      expect(stage().getAttribute("src")).toContain(`fills=${FILL.id}`);
      // Apply waits for the decision; it never takes an undecided result.
      expect(within(dialog).getByRole("button", { name: "Apply" })).toBeDisabled();

      const before = within(dialog).getByRole("button", { name: "Before" });
      await user.click(before);
      expect(before).toHaveAttribute("aria-pressed", "true");
      expect(stage().getAttribute("src")).not.toContain("image-fill");
      await user.click(before);
      expect(stage().getAttribute("src")).toContain(`fills=${FILL.id}`);

      // Holding the picture compares too, only while the button is down.
      const overlay = within(dialog).getByTestId("fill-overlay");
      fireEvent.pointerDown(overlay, { pointerId: 2, button: 0, clientX: 0, clientY: 0 });
      expect(stage().getAttribute("src")).not.toContain("image-fill");
      fireEvent.pointerUp(overlay, { pointerId: 2 });
      expect(stage().getAttribute("src")).toContain(`fills=${FILL.id}`);

      await user.click(within(dialog).getByRole("button", { name: "Keep fill" }));
      expect(within(dialog).getByText("1 fill")).toBeInTheDocument();
      await user.click(within(dialog).getByRole("button", { name: "Apply" }));

      await waitFor(() => expect(applyImageEdit).toHaveBeenCalledTimes(1));
      expect(vi.mocked(applyImageEdit).mock.calls[0][1].fills).toEqual([FILL]);
      expect(startImageFill).toHaveBeenCalledTimes(1);
      expect(discardFillResult).not.toHaveBeenCalled();
    });

    it("asks before leaving an undecided fill, and discarding drops it on the server", async () => {
      const { user, dialog, props } = await generateFill();

      await user.click(within(dialog).getByRole("button", { name: "Close" }));
      await screen.findByRole("alertdialog", { name: "Discard changes?" });
      expect(props.onClose).not.toHaveBeenCalled();

      await user.click(await screen.findByRole("button", { name: "Discard" }));

      await waitFor(() => expect(props.onClose).toHaveBeenCalled());
      await waitFor(() => expect(discardFillResult).toHaveBeenCalledWith(PHOTO, FILL.id));
    });

    it("cancels a run in progress when the edit is reset", async () => {
      vi.mocked(fetchFillOperation).mockResolvedValue({
        id: FILL.id,
        path: PHOTO,
        status: "running",
        preset: "quality",
      });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderDialog();
      const dialog = await screen.findByRole("dialog", { name: "Viewing sunset.png" });
      await user.click(within(dialog).getByRole("button", { name: "Edit sunset.png" }));
      fireEvent.load(dialog.querySelector("img")!);
      await openFillTool(user, dialog);
      const overlay = await within(dialog).findByTestId("fill-overlay");
      fireEvent.pointerDown(overlay, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
      fireEvent.pointerUp(overlay, { pointerId: 1 });
      const generate = within(dialog).getByRole("button", { name: "Generate" });
      await waitFor(() => expect(generate).toBeEnabled());
      await user.click(generate);
      await within(dialog).findByRole("button", { name: "Cancel" });

      await user.click(within(dialog).getByRole("button", { name: "Reset" }));

      await waitFor(() => expect(cancelFillOperation).toHaveBeenCalledWith(FILL.id));
      expect(within(dialog).getByRole("button", { name: "Generate" })).toBeDisabled();
    });
  });
});
