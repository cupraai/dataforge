import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  iconCpu,
  iconFan,
  iconGpu,
  iconMemoryStick,
  iconThermometer,
  iconZap,
} from "@/shared/icons";
import { useSystemSpecs } from "@/features/automation/hooks/useSystemSpecs";
import {
  levelClass,
  memoryPercent,
  temperatureLevel,
  usageLevel,
  type UsageLevel,
} from "@/features/automation/lib/systemLevels";
import { classNames } from "@/shared/lib/classNames";
import { formatBytes, formatBytesValue } from "@/shared/lib/format";
import { Icon } from "@/shared/ui/Icon";

export interface AutomationSystemSpecsProps {
  id: string;
  /** Only an open panel polls. */
  open: boolean;
}

export function AutomationSystemSpecs({ id, open }: AutomationSystemSpecsProps) {
  const specs = useSystemSpecs(open);
  if (!specs) return null;

  const cpuLoad = specs.cpu_load_percent;
  const cpuTemperature = specs.cpu_temperature_celsius;
  const cpuPower = specs.cpu_power_watts;
  const gpuName = specs.gpu_available ? specs.gpu_name : null;
  const gpuLoad = specs.gpu_load_percent;
  const gpuTemperature = specs.gpu_temperature_celsius;
  const gpuPower = specs.gpu_power_watts;
  const gpuPowerLimit = specs.gpu_power_limit_watts;
  const gpuFan = specs.gpu_fan_percent;
  const vramTotal = specs.gpu_memory_bytes;
  const vramUsed = specs.gpu_memory_used_bytes;

  return (
    <div className="automation__system">
      <div
        id={id}
        hidden={!open}
        className={classNames("automation__specs-panel", open && "automation__specs-panel--open")}
      >
        <div className="system-specs" role="region" aria-label="System specifications">
          <SpecCard
            icon={iconCpu}
            label="CPU"
            hardware={`${specs.cpu_name} · ${specs.cpu_cores} cores`}
            readings={
              <>
                {cpuTemperature != null && (
                  <TemperatureReading celsius={cpuTemperature} title="CPU temperature" />
                )}
                {cpuPower != null && <PowerReading watts={cpuPower} title="CPU power" />}
              </>
            }
          >
            <SpecMeter caption="Load" label="CPU load" percent={cpuLoad}>
              {cpuLoad != null && `${Math.round(cpuLoad)}%`}
            </SpecMeter>
          </SpecCard>
          <SpecCard icon={iconMemoryStick} label="RAM" hardware="System memory">
            <SpecMeter
              caption="Used"
              label="RAM usage"
              percent={memoryPercent(specs.memory_used_bytes, specs.memory_total_bytes)}
            >
              <MemoryValue
                usedBytes={specs.memory_used_bytes}
                totalBytes={specs.memory_total_bytes}
              />
            </SpecMeter>
          </SpecCard>
          <SpecCard
            icon={iconGpu}
            label="GPU"
            hardware={gpuName ?? "No GPU"}
            readings={
              gpuName != null && (
                <>
                  {gpuTemperature != null && (
                    <TemperatureReading celsius={gpuTemperature} title="GPU temperature" />
                  )}
                  {gpuPower != null && (
                    <PowerReading
                      watts={gpuPower}
                      limitWatts={gpuPowerLimit}
                      title={gpuPowerLimit != null ? "GPU power / limit" : "GPU power"}
                    />
                  )}
                  {gpuFan != null && (
                    <Reading icon={iconFan} title="GPU fan speed">
                      {Math.round(gpuFan)}%
                    </Reading>
                  )}
                </>
              )
            }
          >
            <SpecMeter caption="Load" label="GPU load" percent={gpuName != null ? gpuLoad : null}>
              {gpuName != null && gpuLoad != null && `${Math.round(gpuLoad)}%`}
            </SpecMeter>
            <SpecMeter
              caption="VRAM"
              label="VRAM usage"
              percent={
                gpuName != null && vramTotal != null && vramUsed != null
                  ? memoryPercent(vramUsed, vramTotal)
                  : null
              }
            >
              {gpuName != null &&
                vramTotal != null &&
                (vramUsed != null ? (
                  <MemoryValue usedBytes={vramUsed} totalBytes={vramTotal} />
                ) : (
                  <span title="VRAM total">{formatBytes(vramTotal)}</span>
                ))}
            </SpecMeter>
          </SpecCard>
        </div>
      </div>
    </div>
  );
}

interface SpecCardProps {
  icon: LucideIcon;
  label: string;
  /** Model or description; truncates first so the readings beside it stay whole. */
  hardware: string;
  /** Secondary figures in the header, each a `Reading`. */
  readings?: ReactNode;
  /** The card's meters. */
  children: ReactNode;
}

function SpecCard({ icon, label, hardware, readings, children }: SpecCardProps) {
  return (
    // A group, not a section: three nested landmarks would crowd the region they sit in.
    <div className="system-specs__card" role="group" aria-label={label}>
      <div className="system-specs__header">
        <span className="system-specs__icon" aria-hidden="true">
          <Icon icon={icon} />
        </span>
        <span className="system-specs__label">{label}</span>
        <span className="system-specs__hardware" title={hardware}>
          {hardware}
        </span>
        {readings && <span className="system-specs__readings">{readings}</span>}
      </div>
      <div className="system-specs__meters">{children}</div>
    </div>
  );
}

interface SpecMeterProps {
  /** Short visible caption above the bar. */
  caption: string;
  /** Accessible name of the meter. */
  label: string;
  /** Fill of the bar; none leaves an empty track and says the figure is unavailable. */
  percent?: number | null;
  /** The figure beside the caption; nothing means unavailable. */
  children?: ReactNode;
}

function SpecMeter({ caption, label, percent, children }: SpecMeterProps) {
  const known = percent != null;
  const clamped = known ? Math.min(100, Math.max(0, percent)) : 0;
  const rounded = Math.round(clamped);
  const level = known ? usageLevel(rounded) : "normal";
  return (
    <div className="system-specs__meter">
      <div className="system-specs__meter-head">
        <span className="system-specs__caption">{caption}</span>
        <span
          className={classNames(
            "system-specs__value",
            levelClass("system-specs__value", level),
            !children && "system-specs__value--unavailable",
          )}
        >
          {children || "Unavailable"}
        </span>
      </div>
      <span
        className="system-specs__bar"
        {...(known
          ? {
              role: "meter",
              "aria-label": label,
              "aria-valuemin": 0,
              "aria-valuemax": 100,
              "aria-valuenow": rounded,
              "aria-valuetext": `${rounded}%`,
            }
          : { "aria-hidden": true })}
      >
        <span
          className={classNames("system-specs__fill", levelClass("system-specs__fill", level))}
          style={{ width: `${clamped}%` }}
        />
      </span>
    </div>
  );
}

interface ReadingProps {
  icon: LucideIcon;
  /** Names the figure for hover and screen readers. */
  title: string;
  level?: UsageLevel;
  children: ReactNode;
}

function Reading({ icon, title, level = "normal", children }: ReadingProps) {
  return (
    <span
      className={classNames("system-specs__reading", levelClass("system-specs__reading", level))}
      title={title}
    >
      <Icon icon={icon} className="system-specs__reading-icon" />
      <span className="system-specs__sr-label">{title}: </span>
      {children}
    </span>
  );
}

function TemperatureReading({ celsius, title }: { celsius: number; title: string }) {
  const rounded = Math.round(celsius);
  return (
    <Reading icon={iconThermometer} title={title} level={temperatureLevel(rounded)}>
      {rounded}°C
    </Reading>
  );
}

interface PowerReadingProps {
  watts: number;
  /** The enforced cap; draw is coloured by its share of it, like load. */
  limitWatts?: number | null;
  title: string;
}

function PowerReading({ watts, limitWatts, title }: PowerReadingProps) {
  const rounded = Math.round(watts);
  if (limitWatts == null || limitWatts <= 0) {
    return (
      <Reading icon={iconZap} title={title}>
        {rounded} W
      </Reading>
    );
  }
  return (
    <Reading icon={iconZap} title={title} level={usageLevel((100 * watts) / limitWatts)}>
      {rounded}
      <span className="system-specs__total"> / {Math.round(limitWatts)} W</span>
    </Reading>
  );
}

function MemoryValue({ usedBytes, totalBytes }: { usedBytes: number; totalBytes: number }) {
  return (
    <>
      {formatBytesValue(usedBytes)}
      <span className="system-specs__total"> / {formatBytes(totalBytes)}</span>
    </>
  );
}
