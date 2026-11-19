import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SystemSpecs } from "@/shared/types";
import { AutomationSystemSpecs } from "./AutomationSystemSpecs";

const defaultSystemSpecs: SystemSpecs = {
  cpu_name: "Intel Core i7-12700K 12-Core Processor",
  cpu_cores: 16,
  cpu_load_percent: 37.6,
  cpu_temperature_celsius: 54.2,
  memory_total_bytes: 32 * 1024 ** 3,
  memory_used_bytes: 8 * 1024 ** 3,
  gpu_name: "NVIDIA GeForce RTX 3080",
  gpu_memory_bytes: 10 * 1024 ** 3,
  gpu_memory_used_bytes: 4 * 1024 ** 3,
  gpu_load_percent: 41,
  gpu_temperature_celsius: 71.8,
  gpu_available: true,
};

let mockSystemSpecs: SystemSpecs | null = defaultSystemSpecs;

const useSystemSpecsMock = vi.fn<(_live?: boolean) => SystemSpecs | null>(
  (_live?: boolean) => mockSystemSpecs,
);

vi.mock("@/features/automation/hooks/useSystemSpecs", () => ({
  useSystemSpecs: (live?: boolean) => useSystemSpecsMock(live),
}));

function renderSpecs(open = true) {
  return render(<AutomationSystemSpecs id="specs-panel" open={open} />);
}

const card = (name: string) => screen.getByRole("group", { name });
const meterValue = (name: string) =>
  screen.getByRole("meter", { name }).getAttribute("aria-valuenow");
const fill = (name: string) => screen.getByRole("meter", { name }).firstElementChild;
/** The figure printed beside a meter's caption. */
const meterFigure = (cardName: string, caption: string) =>
  within(card(cardName)).getByText(caption).nextElementSibling;
const reading = (title: string) => screen.queryByTitle(title);

describe("AutomationSystemSpecs", () => {
  beforeEach(() => {
    mockSystemSpecs = defaultSystemSpecs;
    useSystemSpecsMock.mockClear();
  });

  it("shows a card per device with its hardware and figures", () => {
    renderSpecs();

    expect(card("CPU")).toHaveTextContent("Intel Core i7-12700K");
    expect(card("CPU")).toHaveTextContent("16 cores");
    expect(meterFigure("CPU", "Load")).toHaveTextContent(/^38%$/);
    // Used / total, as Task Manager shows it, with the unit once after the total.
    expect(meterFigure("RAM", "Used")).toHaveTextContent(/^8 \/ 32 GB$/);
    expect(card("GPU")).toHaveTextContent("NVIDIA GeForce RTX 3080");
    expect(meterFigure("GPU", "Load")).toHaveTextContent(/^41%$/);
    expect(meterFigure("GPU", "VRAM")).toHaveTextContent(/^4 \/ 10 GB$/);
    expect(reading("CPU temperature")).toHaveTextContent("54°C");
    expect(reading("GPU temperature")).toHaveTextContent("72°C");
  });

  it("names each reading for screen readers, not only by its icon", () => {
    renderSpecs();

    // The icon is decorative; a visually hidden label says what the figure is.
    expect(reading("CPU temperature")).toHaveTextContent(/^CPU temperature: 54°C$/);
    expect(reading("CPU temperature")?.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("draws a meter per figure: CPU load, RAM used, GPU load and VRAM used", () => {
    renderSpecs();

    expect(meterValue("CPU load")).toBe("38");
    // RAM is the used share of the total (8 of 32 GB), not a load figure.
    expect(meterValue("RAM usage")).toBe("25");
    expect(meterValue("GPU load")).toBe("41");
    // VRAM has its own meter: 4 of 10 GB.
    expect(meterValue("VRAM usage")).toBe("40");
  });

  it("keeps an empty track and says unavailable where a figure is unknown", () => {
    mockSystemSpecs = { ...defaultSystemSpecs, cpu_load_percent: null, gpu_load_percent: null };

    const { container } = renderSpecs();

    expect(screen.getAllByRole("meter").map((meter) => meter.getAttribute("aria-label"))).toEqual([
      "RAM usage",
      "VRAM usage",
    ]);
    // Every meter keeps its track, so the cards stay the same height.
    expect(container.querySelectorAll(".system-specs__bar")).toHaveLength(4);
    expect(meterFigure("CPU", "Load")).toHaveTextContent("Unavailable");
    expect(meterFigure("GPU", "Load")).toHaveTextContent("Unavailable");
  });

  it("polls only while the panel is open", () => {
    const { rerender } = renderSpecs(true);
    expect(useSystemSpecsMock).toHaveBeenLastCalledWith(true);

    rerender(<AutomationSystemSpecs id="specs-panel" open={false} />);
    expect(useSystemSpecsMock).toHaveBeenLastCalledWith(false);
  });

  it("opens the panel and keeps the toggle's aria-controls target", () => {
    const { container, rerender } = renderSpecs(false);

    const panel = container.querySelector("#specs-panel");
    expect(panel).toHaveClass("automation__specs-panel");
    expect(panel).not.toHaveClass("automation__specs-panel--open");
    expect(panel).not.toBeVisible();
    expect(screen.queryByRole("region", { name: "System specifications" })).not.toBeInTheDocument();

    rerender(<AutomationSystemSpecs id="specs-panel" open />);
    expect(container.querySelector("#specs-panel")).toHaveClass("automation__specs-panel--open");
    expect(screen.getByRole("region", { name: "System specifications" })).toBeVisible();
  });

  it("colours figures and bars yellow from 75% and red from 90%", () => {
    mockSystemSpecs = {
      ...defaultSystemSpecs,
      cpu_load_percent: 74.4, // just under: rounds to 74, stays normal
      memory_used_bytes: 24 * 1024 ** 3, // 24 of 32 GB = 75%
      gpu_memory_used_bytes: 9 * 1024 ** 3, // 9 of 10 GB = 90%
      gpu_load_percent: 80,
    };

    renderSpecs();

    expect(meterFigure("CPU", "Load")?.className).toBe("system-specs__value");
    expect(meterFigure("RAM", "Used")).toHaveClass("system-specs__value--warning");
    expect(meterFigure("GPU", "Load")).toHaveClass("system-specs__value--warning");
    expect(meterFigure("GPU", "VRAM")).toHaveClass("system-specs__value--danger");

    expect(fill("CPU load")?.className).toBe("system-specs__fill");
    expect(fill("RAM usage")).toHaveClass("system-specs__fill--warning");
    expect(fill("GPU load")).toHaveClass("system-specs__fill--warning");
    expect(fill("VRAM usage")).toHaveClass("system-specs__fill--danger");
  });

  it("keeps the memory total muted so only the used figure carries the colour", () => {
    mockSystemSpecs = { ...defaultSystemSpecs, memory_used_bytes: 30 * 1024 ** 3 };

    renderSpecs();

    const used = meterFigure("RAM", "Used");
    expect(used).toHaveClass("system-specs__value--danger");
    expect(used?.querySelector(".system-specs__total")).toHaveTextContent("/ 32 GB");
  });

  it("colours temperatures yellow from 80°C and red from 95°C", () => {
    mockSystemSpecs = {
      ...defaultSystemSpecs,
      cpu_temperature_celsius: 80,
      gpu_temperature_celsius: 95,
    };

    renderSpecs();

    expect(reading("CPU temperature")).toHaveClass("system-specs__reading--warning");
    expect(reading("GPU temperature")).toHaveClass("system-specs__reading--danger");
  });

  it("hides a temperature the machine does not report", () => {
    mockSystemSpecs = {
      ...defaultSystemSpecs,
      cpu_temperature_celsius: null,
      gpu_temperature_celsius: null,
    };

    renderSpecs();

    expect(reading("CPU temperature")).toBeNull();
    expect(reading("GPU temperature")).toBeNull();
  });

  it("turns the load red at 90%", () => {
    mockSystemSpecs = { ...defaultSystemSpecs, cpu_load_percent: 90, gpu_load_percent: 100 };

    renderSpecs();

    expect(meterFigure("CPU", "Load")).toHaveClass("system-specs__value--danger");
    expect(meterFigure("GPU", "Load")).toHaveTextContent("100%");
    expect(fill("CPU load")).toHaveClass("system-specs__fill--danger");
    expect(fill("GPU load")).toHaveClass("system-specs__fill--danger");
  });

  it("leaves figures and bars uncoloured below the warning threshold", () => {
    mockSystemSpecs = {
      ...defaultSystemSpecs,
      cpu_temperature_celsius: 54,
      gpu_temperature_celsius: 61,
    };

    const { container } = renderSpecs();

    expect(container.querySelector('[class*="--warning"], [class*="--danger"]')).toBeNull();
  });

  it("shows the VRAM total alone when usage is unknown", () => {
    mockSystemSpecs = { ...defaultSystemSpecs, gpu_memory_used_bytes: null };

    renderSpecs();

    expect(screen.getByTitle("VRAM total")).toHaveTextContent("10 GB");
    expect(screen.queryByRole("meter", { name: "VRAM usage" })).toBeNull();
  });

  it("shows CPU power and GPU power against its limit in the card headers", () => {
    mockSystemSpecs = {
      ...defaultSystemSpecs,
      cpu_power_watts: 141.6,
      gpu_power_watts: 300.4,
      gpu_power_limit_watts: 320,
      gpu_fan_percent: 54.6,
    };

    renderSpecs();

    expect(reading("CPU power")).toHaveTextContent("142 W");
    expect(reading("GPU power / limit")).toHaveTextContent("300 / 320 W");
    expect(reading("GPU fan speed")).toHaveTextContent("55%");
    // 300 of 320 W is 94% of the cap, coloured like load.
    expect(reading("GPU power / limit")).toHaveClass("system-specs__reading--danger");
    expect(within(card("CPU")).getByTitle("CPU power")).toBeInTheDocument();
    expect(within(card("GPU")).getByTitle("GPU fan speed")).toBeInTheDocument();
  });

  it("shows GPU power alone when the card reports no limit", () => {
    mockSystemSpecs = { ...defaultSystemSpecs, gpu_power_watts: 95, gpu_power_limit_watts: null };

    renderSpecs();

    expect(reading("GPU power")).toHaveTextContent(/95 W$/);
    expect(reading("GPU power")?.className).toBe("system-specs__reading");
  });

  it("leaves out power and fan readings the machine does not report", () => {
    renderSpecs();

    expect(reading("CPU power")).toBeNull();
    expect(reading("GPU power / limit")).toBeNull();
    expect(reading("GPU fan speed")).toBeNull();
  });

  it("has no motherboard fan card", () => {
    renderSpecs();

    expect(screen.getAllByRole("group").map((group) => group.getAttribute("aria-label"))).toEqual([
      "CPU",
      "RAM",
      "GPU",
    ]);
  });

  it("falls back to No GPU and unavailable figures when none is available", () => {
    mockSystemSpecs = {
      ...defaultSystemSpecs,
      gpu_available: false,
      gpu_power_watts: 120,
      gpu_fan_percent: 30,
    };

    renderSpecs();

    expect(card("GPU")).toHaveTextContent("No GPU");
    expect(meterFigure("GPU", "Load")).toHaveTextContent("Unavailable");
    expect(meterFigure("GPU", "VRAM")).toHaveTextContent("Unavailable");
    expect(reading("GPU temperature")).toBeNull();
    expect(reading("GPU fan speed")).toBeNull();
  });

  it("renders nothing until the specs load", () => {
    mockSystemSpecs = null;

    const { container } = renderSpecs();

    expect(container).toBeEmptyDOMElement();
  });
});
