import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  emptyAutomationSettings,
  type JobSettingsByType,
} from "@/features/automation/preferences/automationPreferences";
import { SplitVideoDialog } from "./SplitVideoDialog";

const DEFAULTS: JobSettingsByType["split_video"] =
  emptyAutomationSettings("C:/datasets/clips").split_video;

function renderDialog(overrides: Partial<JobSettingsByType["split_video"]> = {}) {
  const onConfirm = vi.fn<ComponentProps<typeof SplitVideoDialog>["onConfirm"]>();
  render(
    <SplitVideoDialog
      scope={{ itemCount: 3, folderLabel: "Walks", kind: "folder" as const }}
      initialSettings={{ ...DEFAULTS, ...overrides }}
      onConfirm={onConfirm}
      onCancel={vi.fn<() => void>()}
    />,
  );
  return onConfirm;
}

function splitButton() {
  return screen.getByRole("button", { name: "Split videos" });
}

describe("SplitVideoDialog", () => {
  it("submits the remembered settings unchanged", async () => {
    const user = userEvent.setup();
    const onConfirm = renderDialog({ sensitivity: "high", frame_rate: 16 });

    await user.click(splitButton());

    expect(onConfirm).toHaveBeenCalledWith({
      mode: "scenes",
      sensitivity: "high",
      longest_seconds: 5,
      interval_seconds: 5,
      shortest_seconds: 1,
      frame_rate: 16,
    });
  });

  it("edits the clip length of the chosen mode and keeps the other one", async () => {
    const user = userEvent.setup();
    const onConfirm = renderDialog({ longest_seconds: 6 });

    await user.click(screen.getByRole("radio", { name: /Evenly/ }));
    expect(screen.getByRole("radio", { name: /Medium/ })).toBeDisabled();
    await user.clear(screen.getByLabelText("Clip length (s)"));
    await user.type(screen.getByLabelText("Clip length (s)"), "3");
    await user.selectOptions(screen.getByLabelText("Frame rate"), "24");
    await user.click(splitButton());

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "interval",
        interval_seconds: 3,
        longest_seconds: 6,
        frame_rate: 24,
      }),
    );
  });

  it("refuses a shortest clip longer than the longest", async () => {
    const user = userEvent.setup();
    const onConfirm = renderDialog();

    await user.clear(screen.getByLabelText("Shortest clip (s)"));
    await user.type(screen.getByLabelText("Shortest clip (s)"), "8");
    await user.click(splitButton());

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The shortest clip cannot be longer than the longest clip.",
    );
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("refuses an empty or out-of-range length", async () => {
    const user = userEvent.setup();
    const onConfirm = renderDialog();

    await user.clear(screen.getByLabelText("Longest clip (s)"));
    await user.click(splitButton());

    expect(screen.getByRole("alert")).toHaveTextContent("The longest clip must be from");
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
