import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import type { ComponentProps } from "react";
import { TrimVideoDialog } from "./TrimVideoDialog";
import {
  emptyAutomationSettings,
  type JobSettingsByType,
} from "@/features/automation/preferences/automationPreferences";

const RESET_LABEL = "Clear the trim";
const LENGTH_LABEL = "Longest length (s)";
const DEFAULTS: JobSettingsByType["trim_video"] =
  emptyAutomationSettings("C:/datasets/clips").trim_video;

function renderDialog(overrides: Partial<JobSettingsByType["trim_video"]> = {}) {
  const onConfirm = vi.fn<ComponentProps<typeof TrimVideoDialog>["onConfirm"]>();
  render(
    <TrimVideoDialog
      scope={{ itemCount: 4, folderLabel: "Clips", kind: "folder" as const }}
      initialSettings={{ ...DEFAULTS, ...overrides }}
      onConfirm={onConfirm}
      onCancel={vi.fn<() => void>()}
    />,
  );
  return onConfirm;
}

describe("TrimVideoDialog", () => {
  it("submits the remembered length and part unchanged", async () => {
    const user = userEvent.setup();
    const onConfirm = renderDialog({ max_seconds: 3.5, keep: "middle" });

    expect(screen.getByRole("radio", { name: /Middle/ })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Trim videos" }));

    expect(onConfirm).toHaveBeenCalledWith({ max_seconds: 3.5, keep: "middle", reset_trim: false });
  });

  it("submits the typed length and the chosen part", async () => {
    const user = userEvent.setup();
    const onConfirm = renderDialog();

    await user.clear(screen.getByLabelText(LENGTH_LABEL));
    await user.type(screen.getByLabelText(LENGTH_LABEL), "12");
    await user.click(screen.getByRole("radio", { name: /End/ }));
    await user.click(screen.getByRole("button", { name: "Trim videos" }));

    expect(onConfirm).toHaveBeenCalledWith({ max_seconds: 12, keep: "end", reset_trim: false });
  });

  it.each(["", "0.2", "5000"])("refuses a length of %j", async (value) => {
    const user = userEvent.setup();
    const onConfirm = renderDialog();

    await user.clear(screen.getByLabelText(LENGTH_LABEL));
    if (value) await user.type(screen.getByLabelText(LENGTH_LABEL), value);
    await user.click(screen.getByRole("button", { name: "Trim videos" }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("The longest length must be from");
  });

  it("clears with the remembered settings even while the length cannot be read", async () => {
    const user = userEvent.setup();
    const onConfirm = renderDialog({ max_seconds: 3.5, keep: "end" });

    await user.clear(screen.getByLabelText(LENGTH_LABEL));
    await user.click(screen.getByLabelText(RESET_LABEL));

    expect(screen.getByRole("dialog", { name: "Clear trims?" })).toBeInTheDocument();
    expect(screen.getByLabelText(LENGTH_LABEL)).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Clear trims" }));
    expect(onConfirm).toHaveBeenCalledWith({ max_seconds: 3.5, keep: "end", reset_trim: true });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
