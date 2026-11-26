import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  levelClass,
  memoryPercent,
  temperatureLevel,
  usageLevel,
  type UsageLevel,
} from "@/features/automation/lib/systemLevels";
import { formatApiError } from "@/shared/api/http";
import {
  iconActivity,
  iconCpu,
  iconGpu,
  iconHardDrive,
  iconLayers,
  iconMemoryStick,
  iconThermometer,
  iconZap,
  type AppIcon,
} from "@/shared/icons";
import { classNames } from "@/shared/lib/classNames";
import { formatBytes, formatBytesValue, formatFileSize } from "@/shared/lib/format";
import type { GpuProcessMemory, SystemPerformance } from "@/shared/types";
import { Icon } from "@/shared/ui/Icon";
import { RollingNumber } from "@/shared/ui/RollingNumber";
import { Tooltip } from "@/shared/ui/Tooltip";
import { fetchSystemPerformance, settingsKeys } from "../api/settings";
import { assignVramSlots } from "../lib/vramSlots";
import { SettingsGroup } from "./SettingsGroup";

/** One read a second, like the toolbar's system panel; each costs two nvidia-smi calls. */
const PERFORMANCE_REFRESH_MS = 1_000;
/** A minute of readings at one a second. */
const HISTORY_LENGTH = 60;

interface Sample {
  cpu: number | null;
  memory: number;
  gpu: number | null;
  vram: number | null;
}

function vramPercent(data: SystemPerformance): number | null {
  const { gpu_memory_bytes: total, gpu_memory_used_bytes: used } = data;
  return data.gpu_available && total != null && used != null ? memoryPercent(used, total) : null;
}

function sampleOf(data: SystemPerformance): Sample {
  return {
    cpu: data.cpu_load_percent ?? null,
    memory: memoryPercent(data.memory_used_bytes, data.memory_total_bytes),
    gpu: data.gpu_available ? (data.gpu_load_percent ?? null) : null,
    vram: vramPercent(data),
  };
}

/** The last minute of readings, gathered only while the page is shown. */
function usePerformance(visible: boolean) {
  const query = useQuery({
    queryKey: settingsKeys.performance,
    queryFn: ({ signal }) => fetchSystemPerformance(signal),
    enabled: visible,
    staleTime: PERFORMANCE_REFRESH_MS,
    refetchOnWindowFocus: false,
    refetchInterval: visible ? PERFORMANCE_REFRESH_MS : false,
    refetchIntervalInBackground: true,
    retry: false,
  });
  const [history, setHistory] = useState<{
    source?: SystemPerformance;
    samples: Sample[];
    vramSlots: (number | null)[];
  }>({ samples: [], vramSlots: [] });
  // Each read is a new object, so it is recorded once, during the render that first sees it.
  if (visible && query.data && query.data !== history.source) {
    setHistory({
      source: query.data,
      samples: [...history.samples, sampleOf(query.data)].slice(-HISTORY_LENGTH),
      vramSlots: assignVramSlots(history.vramSlots, query.data.gpu_processes ?? []),
    });
  }
  return { query, samples: history.samples, vramSlots: history.vramSlots };
}

function formatClock(mhz: number): string {
  return mhz >= 1000 ? `${(mhz / 1000).toFixed(2)} GHz` : `${Math.round(mhz)} MHz`;
}

function formatRate(bytesPerSecond: number | null | undefined): string {
  return bytesPerSecond == null ? "Unavailable" : `${formatFileSize(bytesPerSecond)}/s`;
}

/** ``3 d 4 h``, ``4 h 12 m``, ``12 m``: the two largest units are enough to read age by. */
function formatUptime(seconds: number | null | undefined): string {
  if (seconds == null) return "Unavailable";
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days} d ${hours % 24} h`;
  if (hours > 0) return `${hours} h ${minutes % 60} m`;
  return `${Math.max(1, minutes)} m`;
}

function usedOf(used: number, total: number): ReactNode {
  return (
    <>
      {formatBytesValue(used)}
      <span className="performance__total"> / {formatBytes(total)}</span>
    </>
  );
}

export function PerformanceSection({ visible }: { visible: boolean }) {
  const { query, samples, vramSlots } = usePerformance(visible);
  const data = query.data;

  if (!data) {
    return query.isError ? (
      <p className="dialog__error" role="alert">
        {formatApiError(query.error)}
      </p>
    ) : (
      <p className="settings-dialog__status" role="status">
        Reading the system...
      </p>
    );
  }

  const gpu = data.gpu_available;
  const vram = vramPercent(data);
  const swapLabel = data.os_name.startsWith("Windows") ? "Page file" : "Swap";

  return (
    <div className="performance">
      <div className="performance__tiles" role="region" aria-label="Live usage">
        <UsageTile
          icon={iconCpu}
          label="CPU"
          percent={data.cpu_load_percent}
          history={samples.map((sample) => sample.cpu)}
          readings={
            <>
              {data.cpu_temperature_celsius != null && (
                <Temperature celsius={data.cpu_temperature_celsius} label="CPU temperature" />
              )}
              {data.cpu_power_watts != null && (
                <Power watts={data.cpu_power_watts} label="CPU power" />
              )}
            </>
          }
        />
        <UsageTile
          icon={iconMemoryStick}
          label="RAM"
          percent={memoryPercent(data.memory_used_bytes, data.memory_total_bytes)}
          history={samples.map((sample) => sample.memory)}
          readings={
            <span className="performance__reading">
              {usedOf(data.memory_used_bytes, data.memory_total_bytes)}
            </span>
          }
        />
        <UsageTile
          icon={iconGpu}
          label="GPU"
          percent={gpu ? data.gpu_load_percent : null}
          history={samples.map((sample) => sample.gpu)}
          missing={gpu ? undefined : "No GPU"}
          readings={
            gpu && (
              <>
                {data.gpu_temperature_celsius != null && (
                  <Temperature celsius={data.gpu_temperature_celsius} label="GPU temperature" />
                )}
                {data.gpu_power_watts != null && (
                  <Power
                    watts={data.gpu_power_watts}
                    limitWatts={data.gpu_power_limit_watts}
                    label="GPU power"
                  />
                )}
              </>
            )
          }
        />
        <UsageTile
          icon={iconLayers}
          label="VRAM"
          percent={vram}
          history={samples.map((sample) => sample.vram)}
          missing={gpu ? undefined : "No GPU"}
          readings={
            gpu &&
            data.gpu_memory_bytes != null &&
            data.gpu_memory_used_bytes != null && (
              <span className="performance__reading">
                {usedOf(data.gpu_memory_used_bytes, data.gpu_memory_bytes)}
              </span>
            )
          }
        />
      </div>

      <div className="performance__groups">
        <SettingsGroup title="Processor" icon={iconCpu}>
          <dl className="settings-facts">
            <Fact label="Model">{data.cpu_name}</Fact>
            <Fact label="Cores">
              {data.cpu_cores != null
                ? `${data.cpu_cores} cores · ${data.cpu_threads} threads`
                : `${data.cpu_threads} threads`}
            </Fact>
            <Fact label={data.cpu_clock_is_live ? "Clock" : "Base clock"}>
              {data.cpu_clock_mhz != null ? formatClock(data.cpu_clock_mhz) : "Unavailable"}
            </Fact>
            <Fact label="Per thread">
              <CoreStrip loads={data.cpu_core_load_percents} />
            </Fact>
          </dl>
        </SettingsGroup>

        <SettingsGroup title="Graphics" icon={iconGpu}>
          {gpu ? (
            <dl className="settings-facts">
              <Fact label="Model">{data.gpu_name ?? "Unknown"}</Fact>
              <Fact label="Driver">
                {[
                  data.gpu_driver,
                  data.gpu_pcie_generation != null &&
                    data.gpu_pcie_width != null &&
                    `PCIe ${data.gpu_pcie_generation}.0 ×${data.gpu_pcie_width}`,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Unavailable"}
              </Fact>
              <Fact label="Clocks">
                {data.gpu_clock_mhz != null ? (
                  <>
                    {Math.round(data.gpu_clock_mhz)}
                    {data.gpu_max_clock_mhz != null && (
                      <span className="performance__total">
                        {" "}
                        / {Math.round(data.gpu_max_clock_mhz)}
                      </span>
                    )}{" "}
                    MHz
                    {data.gpu_memory_clock_mhz != null &&
                      ` · memory ${Math.round(data.gpu_memory_clock_mhz)} MHz`}
                  </>
                ) : (
                  "Unavailable"
                )}
              </Fact>
              <Fact label="By app">
                {data.gpu_processes != null &&
                data.gpu_memory_bytes != null &&
                data.gpu_memory_used_bytes != null ? (
                  <VramBar
                    processes={data.gpu_processes}
                    slots={vramSlots}
                    usedBytes={data.gpu_memory_used_bytes}
                    totalBytes={data.gpu_memory_bytes}
                  />
                ) : (
                  "Unavailable on this system"
                )}
              </Fact>
            </dl>
          ) : (
            <p className="performance__empty">
              No NVIDIA GPU found. Other graphics cards are not read.
            </p>
          )}
        </SettingsGroup>

        <SettingsGroup title="System" icon={iconActivity}>
          <dl className="settings-facts">
            <Fact label="System">{`${data.os_name} · ${data.architecture}`}</Fact>
            <Fact label="Up for">{formatUptime(data.uptime_seconds)}</Fact>
            <Fact label={swapLabel}>
              {data.swap_total_bytes
                ? usedOf(data.swap_used_bytes ?? 0, data.swap_total_bytes)
                : "None"}
            </Fact>
            <Fact label="DataForge">
              {data.process_memory_bytes != null
                ? [
                    data.process_cpu_percent != null && `${data.process_cpu_percent}% CPU`,
                    formatFileSize(data.process_memory_bytes),
                    `up ${formatUptime(data.process_uptime_seconds)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "Unavailable"}
            </Fact>
          </dl>
        </SettingsGroup>

        <SettingsGroup title="Storage" icon={iconHardDrive}>
          <dl className="settings-facts">
            {data.disks.map((disk) => (
              <Fact key={disk.mountpoint} label={disk.name} title={disk.filesystem}>
                <DiskBar used={disk.used_bytes} total={disk.total_bytes} name={disk.name} />
              </Fact>
            ))}
            <Fact label="Disk I/O">
              read {formatRate(data.disk_read_bytes_per_second)} · write{" "}
              {formatRate(data.disk_write_bytes_per_second)}
            </Fact>
            <Fact label="Network">
              in {formatRate(data.network_received_bytes_per_second)} · out{" "}
              {formatRate(data.network_sent_bytes_per_second)}
            </Fact>
          </dl>
        </SettingsGroup>
      </div>
    </div>
  );
}

function Fact({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
  return (
    <>
      <dt>
        {title ? (
          <Tooltip content={title}>
            <span>{label}</span>
          </Tooltip>
        ) : (
          label
        )}
      </dt>
      <dd>{children}</dd>
    </>
  );
}

interface UsageTileProps {
  icon: AppIcon;
  label: string;
  percent: number | null | undefined;
  history: (number | null)[];
  /** Said instead of a figure when the device is absent. */
  missing?: string;
  readings?: ReactNode;
}

function UsageTile({ icon, label, percent, history, missing, readings }: UsageTileProps) {
  const known = percent != null && !missing;
  const rounded = known ? Math.round(Math.min(100, Math.max(0, percent))) : 0;
  const level = known ? usageLevel(rounded) : "normal";
  return (
    <div
      className={classNames("performance__tile", levelClass("performance__tile", level))}
      role="group"
      aria-label={label}
    >
      <div className="performance__tile-head">
        <span className="performance__tile-icon" aria-hidden="true">
          <Icon icon={icon} />
        </span>
        <span className="performance__tile-label">{label}</span>
        <span
          className={classNames(
            "performance__figure",
            !known && "performance__figure--unavailable",
          )}
        >
          {known ? (
            <>
              <RollingNumber value={rounded} />%
            </>
          ) : (
            (missing ?? "Unavailable")
          )}
        </span>
      </div>
      <div className="performance__readings">{readings}</div>
      <Sparkline values={history} />
    </div>
  );
}

/**
 * The last minute of a 0-100% figure, newest at the right edge. Decorative: the figure above
 * it is the reading, so it stays out of the accessibility tree.
 */
function Sparkline({ values }: { values: (number | null)[] }) {
  const gradientId = useId();
  const width = HISTORY_LENGTH - 1;
  const offset = HISTORY_LENGTH - values.length;
  const points = values.flatMap((value, index) =>
    value == null ? [] : [[offset + index, 100 - Math.min(100, Math.max(0, value))] as const],
  );
  const line = points.map(([x, y]) => `${x},${y}`).join(" ");
  const last = values.at(-1);
  return (
    <div className="performance__spark" aria-hidden="true">
      {points.length > 1 && (
        <svg viewBox={`0 0 ${width} 100`} preserveAspectRatio="none">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" className="performance__spark-stop" />
              <stop offset="1" className="performance__spark-stop performance__spark-stop--end" />
            </linearGradient>
          </defs>
          <polygon
            className="performance__spark-area"
            fill={`url(#${gradientId})`}
            points={`${points[0][0]},100 ${line} ${points.at(-1)![0]},100`}
          />
          <polyline className="performance__spark-line" points={line} />
        </svg>
      )}
      {last != null && (
        <span
          className="performance__spark-dot"
          style={{ "--spark-y": `${100 - Math.min(100, Math.max(0, last))}%` } as CSSProperties}
        />
      )}
    </div>
  );
}

function Temperature({ celsius, label }: { celsius: number; label: string }) {
  const rounded = Math.round(celsius);
  return (
    <Reading icon={iconThermometer} label={label} level={temperatureLevel(rounded)}>
      {rounded}°C
    </Reading>
  );
}

function Power({
  watts,
  limitWatts,
  label,
}: {
  watts: number;
  limitWatts?: number | null;
  label: string;
}) {
  const limited = limitWatts != null && limitWatts > 0;
  return (
    <Reading
      icon={iconZap}
      label={label}
      level={limited ? usageLevel((100 * watts) / limitWatts) : "normal"}
    >
      {Math.round(watts)}
      {limited ? <span className="performance__total"> / {Math.round(limitWatts)} W</span> : " W"}
    </Reading>
  );
}

function Reading({
  icon,
  label,
  level,
  children,
}: {
  icon: AppIcon;
  label: string;
  level: UsageLevel;
  children: ReactNode;
}) {
  return (
    <Tooltip content={label}>
      <span
        className={classNames("performance__reading", levelClass("performance__reading", level))}
      >
        <Icon icon={icon} className="performance__reading-icon" />
        <span className="performance__sr-label">{label}: </span>
        {children}
      </span>
    </Tooltip>
  );
}

/** One bar per hardware thread, so a single busy thread shows even when the average is low. */
function CoreStrip({ loads }: { loads: number[] }) {
  if (loads.length === 0) return <>Unavailable</>;
  const rounded = loads.map((load) => Math.round(Math.min(100, Math.max(0, load))));
  const average = Math.round(rounded.reduce((sum, load) => sum + load, 0) / rounded.length);
  return (
    <span
      className="performance__cores"
      role="img"
      aria-label={`Busiest thread ${Math.max(...rounded)}%, average ${average}%`}
    >
      {rounded.map((load, index) => {
        return (
          <span
            // Threads are fixed for the life of the machine; the index is their identity.
            key={index}
            className={classNames(
              "performance__core",
              levelClass("performance__core", usageLevel(load)),
            )}
            style={{ "--load": load / 100 } as CSSProperties}
          />
        );
      })}
    </span>
  );
}

function DiskBar({ used, total, name }: { used: number; total: number; name: string }) {
  const percent = Math.round(memoryPercent(used, total));
  const level = usageLevel(percent);
  return (
    <span className="performance__disk">
      <span
        className="performance__disk-bar"
        role="meter"
        aria-label={`${name} used`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${percent}%`}
      >
        <span
          className={classNames(
            "performance__disk-fill",
            levelClass("performance__disk-fill", level),
          )}
          style={{ "--used": percent / 100 } as CSSProperties}
        />
      </span>
      <span className="performance__disk-text">
        {formatFileSize(total - used)} free
        <span className="performance__total"> of {formatFileSize(total)}</span>
      </span>
    </span>
  );
}

interface VramPart {
  key: string;
  /** Colour slot, or `null` for the grey "other" part. */
  slot: number | null;
  label: string;
  /** The program behind a service name. */
  detail?: string;
  bytes: number;
}

/** The named holders in slot order, then "other" for what they leave of the used total. */
function vramParts(
  processes: readonly GpuProcessMemory[],
  slots: readonly (number | null)[],
  usedBytes: number,
): VramPart[] {
  const byPid = new Map(processes.map((process) => [process.pid, process]));
  const named = slots.flatMap((pid, slot) => {
    const process = pid == null ? undefined : byPid.get(pid);
    if (!process) return [];
    return [
      {
        key: `pid-${process.pid}`,
        slot,
        label: process.service ?? process.name,
        detail: process.service ? process.name : undefined,
        bytes: process.used_bytes,
      },
    ];
  });
  const namedBytes = named.reduce((sum, part) => sum + part.bytes, 0);
  // Smaller programs, and what the driver keeps for itself.
  const other = usedBytes - namedBytes;
  return other > 0 ? [...named, { key: "other", slot: null, label: "Other", bytes: other }] : named;
}

interface VramBarProps {
  processes: readonly GpuProcessMemory[];
  slots: readonly (number | null)[];
  usedBytes: number;
  totalBytes: number;
}

/**
 * VRAM split by the programs holding it, against the whole card. Each part names itself on
 * hover; the bar, one keyboard stop, lists every part in its tooltip and accessible name.
 */
function VramBar({ processes, slots, usedBytes, totalBytes }: VramBarProps) {
  // The list opens only with focus: on hover it would compete with the part under the pointer.
  const [focused, setFocused] = useState(false);
  const parts = vramParts(processes, slots, usedBytes);
  // The counters and nvidia-smi are read moments apart; never let the parts overflow the bar.
  const whole = Math.max(
    totalBytes,
    parts.reduce((sum, part) => sum + part.bytes, 0),
    1,
  );
  const free = Math.max(0, totalBytes - usedBytes);
  const share = (bytes: number) => Math.round((100 * bytes) / whole);
  const summary = [
    ...parts.map((part) => `${part.label} ${formatFileSize(part.bytes)}`),
    `${formatFileSize(free)} free`,
  ].join(", ");
  const legend = (
    <ul className="performance__vram-legend">
      {parts.map((part) => (
        <li key={part.key}>
          <span className={swatchClass(part.slot)} aria-hidden="true" />
          <span className="performance__vram-name">{part.label}</span>
          <span>{formatFileSize(part.bytes)}</span>
        </li>
      ))}
      <li>
        <span className="performance__vram-swatch" aria-hidden="true" />
        <span className="performance__vram-name">Free</span>
        <span>{formatFileSize(free)}</span>
      </li>
    </ul>
  );

  return (
    <span
      className="performance__vram"
      onFocus={(event) => setFocused(event.target.classList.contains("performance__vram-bar"))}
      onBlur={() => setFocused(false)}
    >
      <Tooltip content={legend} placement="top" disabled={!focused} open={focused}>
        <span
          className="performance__vram-bar"
          role="img"
          aria-label={`VRAM by app: ${summary}`}
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- its tooltip lists the parts
          tabIndex={0}
        >
          {parts.map((part) => (
            <Tooltip
              key={part.key}
              placement="top"
              content={
                <>
                  <strong>{part.detail ? `${part.label} · ${part.detail}` : part.label}</strong>
                  <br />
                  {formatFileSize(part.bytes)} · {share(part.bytes)}% of VRAM
                </>
              }
            >
              <span
                className={classNames("performance__vram-part", swatchClass(part.slot))}
                style={{ flexBasis: `${(100 * part.bytes) / whole}%` }}
              />
            </Tooltip>
          ))}
        </span>
      </Tooltip>
      <span className="performance__vram-free">{formatFileSize(free)} free</span>
    </span>
  );
}

function swatchClass(slot: number | null): string {
  return classNames(
    "performance__vram-swatch",
    slot == null ? "performance__vram-swatch--other" : `performance__vram-swatch--${slot + 1}`,
  );
}
