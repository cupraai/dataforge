import type { GpuProcessMemory } from "@/shared/types";

/** Named parts in the VRAM bar; the rest fold into "other". One per `--chart-series-*` token. */
export const VRAM_SLOTS = 5;

/**
 * Keeps each process on the slot (colour and place) it first got, so two processes trading
 * places in size never swap colours. Freed slots go to the largest newcomers.
 *
 * @param previous pid per slot from the last reading, `null` for a free slot.
 * @param processes this reading's holders, largest first.
 */
export function assignVramSlots(
  previous: readonly (number | null)[],
  processes: readonly GpuProcessMemory[],
): (number | null)[] {
  const present = new Set(processes.map((process) => process.pid));
  const slots = Array.from({ length: VRAM_SLOTS }, (_, index) => {
    const pid = previous[index] ?? null;
    return pid != null && present.has(pid) ? pid : null;
  });
  for (const process of processes) {
    if (slots.includes(process.pid)) continue;
    const free = slots.indexOf(null);
    if (free < 0) break;
    slots[free] = process.pid;
  }
  return slots;
}
