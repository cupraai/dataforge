/** Load or memory share (percent) at or above which figures and bars turn yellow, then red. */
const USAGE_WARNING_PERCENT = 75;
const USAGE_DANGER_PERCENT = 90;

/** Package temperature (°C) at or above which the reading turns yellow, then red. */
const TEMPERATURE_WARNING_CELSIUS = 80;
const TEMPERATURE_DANGER_CELSIUS = 95;

export type UsageLevel = "normal" | "warning" | "danger";

export function usageLevel(percent: number): UsageLevel {
  if (percent >= USAGE_DANGER_PERCENT) return "danger";
  if (percent >= USAGE_WARNING_PERCENT) return "warning";
  return "normal";
}

export function temperatureLevel(celsius: number): UsageLevel {
  if (celsius >= TEMPERATURE_DANGER_CELSIUS) return "danger";
  if (celsius >= TEMPERATURE_WARNING_CELSIUS) return "warning";
  return "normal";
}

export function memoryPercent(usedBytes: number, totalBytes: number): number {
  return totalBytes > 0 ? (100 * usedBytes) / totalBytes : 0;
}

/** Modifier class for a level, or `undefined` at normal usage. */
export function levelClass(base: string, level: UsageLevel): string | undefined {
  return level === "normal" ? undefined : `${base}--${level}`;
}
