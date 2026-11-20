import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { renderWithQueryClient } from "@/test/queryClient";
import { systemPerformance } from "@/test/fixtures";
import type { SystemPerformance } from "@/shared/types";
import type * as settingsApi from "../api/settings";
import { fetchSystemPerformance } from "../api/settings";
import { PerformanceSection } from "./PerformanceSection";

vi.mock("../api/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof settingsApi>()),
  fetchSystemPerformance: vi.fn<(signal?: AbortSignal) => Promise<SystemPerformance>>(),
}));

const fetchMock = vi.mocked(fetchSystemPerformance);

describe("PerformanceSection", () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(systemPerformance());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Moves the page's polling clock on; real time keeps passing for the rest. */
  const elapse = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

  it("reads nothing until the page is shown, then reads every second", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { rerender } = renderWithQueryClient(<PerformanceSection visible={false} />);
    await elapse(3_000);
    expect(fetchMock).not.toHaveBeenCalled();

    rerender(<PerformanceSection visible />);
    await screen.findByRole("region", { name: "Live usage" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValue(systemPerformance({ cpu_load_percent: 80 }));
    await elapse(1_000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const cpu = await screen.findByRole("group", { name: "CPU" });
    await vi.waitFor(() => expect(cpu).toHaveTextContent("80%"));
    // Two readings draw a line, and the newest one is marked at the right edge.
    expect(cpu.querySelector(".performance__spark-line")).toHaveAttribute("points", "58,80 59,20");
    expect(cpu).toHaveClass("performance__tile--warning");
  });

  it("shows each thread's load and names the busiest", async () => {
    renderWithQueryClient(<PerformanceSection visible />);

    const strip = await screen.findByRole("img", { name: "Busiest thread 95%, average 39%" });
    expect(strip.children).toHaveLength(4);
    expect(strip.children[3]).toHaveClass("performance__core--danger");
  });

  it("splits VRAM by app, naming each part and what the named ones leave", async () => {
    const GB = 1024 ** 3;
    fetchMock.mockResolvedValue(
      systemPerformance({
        gpu_memory_bytes: 10 * GB,
        gpu_memory_used_bytes: 6 * GB,
        gpu_processes: [
          { pid: 10, name: "python", service: "ComfyUI", used_bytes: 3 * GB },
          { pid: 20, name: "llama-server", service: null, used_bytes: 2 * GB },
        ],
      }),
    );
    renderWithQueryClient(<PerformanceSection visible />);

    const bar = await screen.findByRole("img", { name: /^VRAM by app/ });
    expect(bar).toHaveAccessibleName(
      "VRAM by app: ComfyUI 3.0 GB, llama-server 2.0 GB, Other 1.0 GB, 4.0 GB free",
    );
    const parts = [...bar.querySelectorAll<HTMLElement>(".performance__vram-part")];
    expect(parts.map((part) => part.style.flexBasis)).toEqual(["30%", "20%", "10%"]);
    expect(parts.at(-1)).toHaveClass("performance__vram-swatch--other");

    const user = userEvent.setup();
    await user.hover(parts[0]);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "ComfyUI · python3.0 GB · 30% of VRAM",
    );

    // From the keyboard, the bar itself lists every part.
    await user.unhover(parts[0]);
    await user.tab();
    expect(bar).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "ComfyUI3.0 GBllama-server2.0 GBOther1.0 GBFree4.0 GB",
    );
  });

  it("keeps each app's colour when two trade places in size", async () => {
    const GB = 1024 ** 3;
    const reading = (comfy: number, vision: number) =>
      systemPerformance({
        gpu_memory_bytes: 10 * GB,
        gpu_memory_used_bytes: (comfy + vision) * GB,
        gpu_processes: [
          { pid: 10, name: "python", service: "ComfyUI", used_bytes: comfy * GB },
          { pid: 20, name: "llama-server", service: "Vision server", used_bytes: vision * GB },
        ].sort((a, b) => b.used_bytes - a.used_bytes),
      });
    fetchMock.mockResolvedValue(reading(3, 1));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWithQueryClient(<PerformanceSection visible />);
    const slotOf = async () => {
      const bar = await screen.findByRole("img", { name: /^VRAM by app/ });
      return [...bar.querySelectorAll(".performance__vram-part")].map((part) =>
        part.className.replace(/.*performance__vram-swatch--/, ""),
      );
    };
    expect(await slotOf()).toEqual(["1", "2"]);

    fetchMock.mockResolvedValue(reading(1, 5));
    await elapse(1_000);

    await vi.waitFor(async () =>
      expect(await screen.findByRole("img", { name: /^VRAM by app/ })).toHaveAccessibleName(
        /ComfyUI 1\.0 GB, Vision server 5\.0 GB/,
      ),
    );
    expect(await slotOf()).toEqual(["1", "2"]);
  });

  it("says when this system cannot split VRAM by app", async () => {
    fetchMock.mockResolvedValue(systemPerformance({ gpu_processes: null }));
    renderWithQueryClient(<PerformanceSection visible />);

    expect(await screen.findByText("Unavailable on this system")).toBeInTheDocument();
  });

  it("says when there is no GPU instead of showing empty figures", async () => {
    fetchMock.mockResolvedValue(
      systemPerformance({ gpu_available: false, gpu_name: null, gpu_load_percent: null }),
    );
    renderWithQueryClient(<PerformanceSection visible />);

    const tiles = await screen.findByRole("region", { name: "Live usage" });
    expect(within(tiles).getByRole("group", { name: "GPU" })).toHaveTextContent("No GPU");
    expect(within(tiles).getByRole("group", { name: "VRAM" })).toHaveTextContent("No GPU");
    expect(screen.getByText(/No NVIDIA GPU found/)).toBeInTheDocument();
  });

  it("names a live clock and swap where the system reports them", async () => {
    fetchMock.mockResolvedValue(
      systemPerformance({ os_name: "Ubuntu 24.04 LTS", cpu_clock_is_live: true }),
    );
    renderWithQueryClient(<PerformanceSection visible />);

    expect(await screen.findByText("Clock")).toBeInTheDocument();
    expect(screen.getByText("3.60 GHz")).toBeInTheDocument();
    expect(screen.getByText("Swap")).toBeInTheDocument();
    expect(screen.queryByText("Page file")).not.toBeInTheDocument();
  });
});
