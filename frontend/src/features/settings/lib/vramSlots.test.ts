import { describe, expect, it } from "vite-plus/test";
import type { GpuProcessMemory } from "@/shared/types";
import { assignVramSlots, VRAM_SLOTS } from "./vramSlots";

const holder = (pid: number, used_bytes = 1): GpuProcessMemory => ({
  pid,
  name: `app-${pid}`,
  service: null,
  used_bytes,
});

describe("assignVramSlots", () => {
  it("hands out slots largest first", () => {
    expect(assignVramSlots([], [holder(7, 9), holder(3, 2)])).toEqual([7, 3, null, null, null]);
  });

  it("keeps a process on its slot when it is overtaken in size", () => {
    const first = assignVramSlots([], [holder(7, 9), holder(3, 2)]);
    expect(assignVramSlots(first, [holder(3, 20), holder(7, 9)])).toEqual(first);
  });

  it("frees a gone process's slot for the next newcomer", () => {
    const first = assignVramSlots([], [holder(7), holder(3)]);
    expect(assignVramSlots(first, [holder(3), holder(11)])).toEqual([11, 3, null, null, null]);
  });

  it("leaves holders past the last slot to the other part", () => {
    const many = Array.from({ length: VRAM_SLOTS + 2 }, (_, index) => holder(index + 1));
    expect(assignVramSlots([], many)).toEqual([1, 2, 3, 4, 5]);
  });
});
