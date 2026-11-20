import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { Slider } from "./Slider";

describe("Slider", () => {
  it("paints the track from the minimum to the value", () => {
    render(<Slider aria-label="Opacity" min={0} max={200} value={50} onChange={() => {}} />);

    const slider = screen.getByRole("slider", { name: "Opacity" });
    expect(slider.style.getPropertyValue("--fill-from")).toBe("0.00%");
    expect(slider.style.getPropertyValue("--fill-to")).toBe("25.00%");
  });

  it("paints outwards from a centred origin", () => {
    render(
      <Slider
        aria-label="Rotation"
        min={-180}
        max={180}
        origin={0}
        value={-90}
        onChange={() => {}}
      />,
    );

    const slider = screen.getByRole("slider", { name: "Rotation" });
    expect(slider.style.getPropertyValue("--fill-from")).toBe("25.00%");
    expect(slider.style.getPropertyValue("--fill-to")).toBe("50.00%");
  });

  it("passes the native change event through", () => {
    const seen: string[] = [];
    render(
      <Slider
        aria-label="Zoom"
        min={0}
        max={10}
        value={2}
        onChange={(event) => seen.push(event.target.value)}
      />,
    );

    fireEvent.change(screen.getByRole("slider", { name: "Zoom" }), { target: { value: "7" } });

    expect(seen).toEqual(["7"]);
  });
});
