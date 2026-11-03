import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { iconCrop } from "@/shared/icons";
import { SHORTCUTS } from "@/shared/lib/shortcuts";
import { stageHintSlot } from "@/test/stageHintSlot";
import { StageHint } from "./StageHint";

describe("StageHint", () => {
  it("shows in the stage slot, with the keys and gestures beside what they do", () => {
    const { slot, wrapper } = stageHintSlot();
    render(
      <StageHint
        icon={iconCrop}
        message="Drag the frame."
        gestures={[
          { shortcut: SHORTCUTS.removeMask, does: "Remove" },
          { keys: ["Home", "End"], does: "To the start or end" },
          { gesture: "Wheel", does: "Zoom" },
        ]}
      />,
      { wrapper },
    );

    expect(slot).toHaveTextContent("Drag the frame.");
    const keys = slot.querySelector(".stage-hint__keys")!;
    expect(keys).toHaveAttribute("aria-hidden", "true");
    expect(keys).toHaveTextContent("Remove");
    expect(keys).toHaveTextContent("HomeEndTo the start or end");
    expect(keys).toHaveTextContent("WheelZoom");
    // A plain hint is not a live region; only a hint that reports progress asks to be read out.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("clears while the pointer is over it, and comes back once it moves away", () => {
    const stage = document.createElement("div");
    const { slot, wrapper } = stageHintSlot();
    stage.appendChild(slot);
    document.body.appendChild(stage);
    render(<StageHint icon={iconCrop} message="Drag the frame." />, { wrapper });
    const hint = slot.querySelector<HTMLElement>(".stage-hint")!;
    hint.getBoundingClientRect = () =>
      ({ left: 100, top: 300, right: 400, bottom: 360, width: 300, height: 60 }) as DOMRect;

    fireEvent.pointerMove(stage, { clientX: 250, clientY: 330 });
    expect(hint).toHaveClass("stage-hint--clear");
    fireEvent.pointerMove(stage, { clientX: 250, clientY: 100 });
    expect(hint).not.toHaveClass("stage-hint--clear");
    fireEvent.pointerMove(stage, { clientX: 250, clientY: 330 });
    fireEvent.pointerLeave(stage);
    expect(hint).not.toHaveClass("stage-hint--clear");
  });

  it("shows nothing without a stage to show in", () => {
    const { container } = render(<StageHint icon={iconCrop} message="Drag the frame." status />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Drag the frame.")).not.toBeInTheDocument();
  });
});
