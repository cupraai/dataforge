"""The fuller machine picture for Settings > About > Performance.

Builds on `system_specs` (sensors, GPU base figures) and adds what psutil and a second
nvidia-smi query know. Rates (disk, network, per-core load, the backend's CPU share) cover the
time since the previous read, so the page's polling cadence sets the window.
"""

from __future__ import annotations

import platform
import subprocess
import sys
import time
from dataclasses import dataclass, field

import psutil

from gpu_process_memory import GpuProcessMemory, gpu_memory_by_process
from system_specs import get_system_specs

#: Drives past this many are left out; the page has room for one row of them.
MAX_DISKS = 8

#: Linux mounts that are images or kernel views, not storage the user filled.
_IGNORED_FILESYSTEMS = frozenset({"squashfs", "tmpfs", "devtmpfs", "overlay", "iso9660", "udf"})


@dataclass(frozen=True)
class DiskUsage:
    name: str
    mountpoint: str
    filesystem: str
    total_bytes: int
    used_bytes: int


@dataclass(frozen=True)
class GpuDetails:
    driver: str | None = None
    clock_mhz: float | None = None
    max_clock_mhz: float | None = None
    memory_clock_mhz: float | None = None
    pcie_generation: int | None = None
    pcie_width: int | None = None


@dataclass(frozen=True)
class SystemPerformance:
    os_name: str
    architecture: str
    uptime_seconds: float | None
    cpu_name: str
    cpu_cores: int | None
    cpu_threads: int
    cpu_clock_mhz: float | None
    cpu_clock_is_live: bool
    cpu_load_percent: float | None
    cpu_core_load_percents: list[float]
    cpu_temperature_celsius: float | None
    cpu_power_watts: float | None
    memory_total_bytes: int
    memory_used_bytes: int
    swap_total_bytes: int | None
    swap_used_bytes: int | None
    gpu_available: bool
    gpu_name: str | None
    gpu_driver: str | None
    gpu_memory_bytes: int | None
    gpu_memory_used_bytes: int | None
    gpu_load_percent: float | None
    gpu_temperature_celsius: float | None
    gpu_power_watts: float | None
    gpu_power_limit_watts: float | None
    gpu_clock_mhz: float | None
    gpu_max_clock_mhz: float | None
    gpu_memory_clock_mhz: float | None
    gpu_pcie_generation: int | None
    gpu_pcie_width: int | None
    gpu_processes: list[GpuProcessMemory] | None
    disk_read_bytes_per_second: float | None
    disk_write_bytes_per_second: float | None
    network_received_bytes_per_second: float | None
    network_sent_bytes_per_second: float | None
    process_cpu_percent: float | None
    process_memory_bytes: int | None
    process_threads: int | None
    process_uptime_seconds: float | None
    disks: list[DiskUsage] = field(default_factory=list)


def _os_name() -> str:
    system = platform.system()
    if system == "Linux":
        try:
            return platform.freedesktop_os_release()["PRETTY_NAME"]
        except (OSError, KeyError):
            return f"Linux {platform.release()}"
    if system == "Darwin":
        return f"macOS {platform.mac_ver()[0]}".strip()
    if system == "Windows":
        return f"Windows {platform.release()} ({platform.version()})"
    return f"{system} {platform.release()}".strip()


def _uptime_seconds() -> float | None:
    try:
        return max(0.0, time.time() - psutil.boot_time())
    except (OSError, RuntimeError):
        return None


def _cpu_clock() -> tuple[float | None, bool]:
    """``(MHz, live)``. Windows reports the rated base clock, not the running one."""
    try:
        frequency = psutil.cpu_freq()
    except (OSError, RuntimeError, NotImplementedError):
        return None, False
    if frequency is None:
        return None, False
    if sys.platform == "win32":
        return (frequency.max or frequency.current or None), False
    return (frequency.current or None), bool(frequency.current)


def _core_loads() -> list[float]:
    try:
        return [round(float(load), 1) for load in psutil.cpu_percent(percpu=True)]
    except (OSError, RuntimeError):
        return []


def _swap() -> tuple[int | None, int | None]:
    try:
        swap = psutil.swap_memory()
    except (OSError, RuntimeError):
        return None, None
    return int(swap.total), int(swap.used)


def _optional_float(value: str) -> float | None:
    try:
        return float(value.strip())
    except ValueError:
        return None


def _optional_int(value: str) -> int | None:
    number = _optional_float(value)
    return int(number) if number is not None else None


#: Asked apart from the specs query: an older driver that rejects one of these must not
#: take the whole GPU out of the toolbar panel.
_GPU_DETAIL_FIELDS = (
    "driver_version,clocks.gr,clocks.max.gr,clocks.mem,pcie.link.gen.max,pcie.link.width.max"
)


def gpu_details() -> GpuDetails:
    try:
        result = subprocess.run(
            ["nvidia-smi", f"--query-gpu={_GPU_DETAIL_FIELDS}", "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return GpuDetails()
    if result.returncode != 0 or not result.stdout.strip():
        return GpuDetails()
    parts = [part.strip() for part in result.stdout.strip().splitlines()[0].split(",")]
    if len(parts) < 6:
        return GpuDetails()
    driver, clock, max_clock, memory_clock, gen, width = parts[:6]
    return GpuDetails(
        driver=driver if driver and not driver.startswith("[") else None,
        clock_mhz=_optional_float(clock),
        max_clock_mhz=_optional_float(max_clock),
        memory_clock_mhz=_optional_float(memory_clock),
        pcie_generation=_optional_int(gen),
        pcie_width=_optional_int(width),
    )


def _disk_name(mountpoint: str) -> str:
    return mountpoint.rstrip("\\") if sys.platform == "win32" else mountpoint


def disk_usage() -> list[DiskUsage]:
    try:
        partitions = psutil.disk_partitions(all=False)
    except (OSError, RuntimeError):
        return []
    disks: list[DiskUsage] = []
    seen: set[str] = set()
    for partition in partitions:
        options = partition.opts.split(",")
        if (
            not partition.fstype
            or partition.fstype in _IGNORED_FILESYSTEMS
            or "cdrom" in options
            or partition.mountpoint.startswith("/snap/")
            or partition.device in seen
        ):
            continue
        try:
            usage = psutil.disk_usage(partition.mountpoint)
        except OSError:
            continue
        if usage.total <= 0:
            continue
        seen.add(partition.device)
        disks.append(
            DiskUsage(
                name=_disk_name(partition.mountpoint),
                mountpoint=partition.mountpoint,
                filesystem=partition.fstype,
                total_bytes=int(usage.total),
                used_bytes=int(usage.used),
            )
        )
        if len(disks) == MAX_DISKS:
            break
    return disks


def _disk_bytes() -> tuple[int, int] | None:
    try:
        counters = psutil.disk_io_counters()
    except (OSError, RuntimeError):
        return None
    return (int(counters.read_bytes), int(counters.write_bytes)) if counters else None


def _network_bytes() -> tuple[int, int] | None:
    try:
        counters = psutil.net_io_counters(pernic=True)
    except (OSError, RuntimeError):
        return None
    # The loopback carries this page's own polling, not traffic the machine does.
    real = [
        counter
        for name, counter in counters.items()
        if not name.lower().startswith(("lo", "loopback"))
    ]
    if not real:
        return None
    return sum(c.bytes_recv for c in real), sum(c.bytes_sent for c in real)


#: The shortest window a rate is measured over.
_MIN_RATE_WINDOW_SECONDS = 0.5


class _RateMeter:
    """Bytes per second for a pair of growing counters, since the previous read."""

    def __init__(self) -> None:
        self._previous: tuple[tuple[int, int], float] | None = None
        self._last: tuple[float, float] | None = None

    def read(self, counters: tuple[int, int] | None) -> tuple[float | None, float | None]:
        now = time.monotonic()
        previous = self._previous
        if counters is None:
            self._previous = None
            return None, None
        if previous is None:
            self._previous = (counters, now)
            return None, None
        elapsed = now - previous[1]
        # Counters tick coarsely, so reads milliseconds apart (two open pages, or a throttled
        # tab catching up) would see no change and report zero; they repeat the last rates.
        if elapsed < _MIN_RATE_WINDOW_SECONDS:
            return self._last or (None, None)
        # A counter that went backwards was reset (a drive or adapter came and went).
        first = max(0, counters[0] - previous[0][0]) / elapsed
        second = max(0, counters[1] - previous[0][1]) / elapsed
        self._previous = (counters, now)
        self._last = (round(first, 1), round(second, 1))
        return self._last


_disk_rates = _RateMeter()
_network_rates = _RateMeter()
_process = psutil.Process()
# The first CPU reads measure from nothing and answer 0; these make the page's first one real.
psutil.cpu_percent(percpu=True)
_process.cpu_percent()


def _process_figures() -> tuple[float | None, int | None, int | None, float | None]:
    """The backend's CPU share of the whole machine, its memory, threads and age."""
    try:
        with _process.oneshot():
            cpu = _process.cpu_percent() / (psutil.cpu_count() or 1)
            memory = int(_process.memory_info().rss)
            threads = _process.num_threads()
            age = max(0.0, time.time() - _process.create_time())
    except (psutil.Error, OSError):
        return None, None, None, None
    return round(cpu, 1), memory, threads, age


def reset_rates_for_tests() -> None:
    global _disk_rates, _network_rates
    _disk_rates = _RateMeter()
    _network_rates = _RateMeter()


def get_system_performance() -> SystemPerformance:
    specs = get_system_specs()
    gpu = gpu_details() if specs.gpu_available else GpuDetails()
    clock, clock_live = _cpu_clock()
    swap_total, swap_used = _swap()
    disk_read, disk_write = _disk_rates.read(_disk_bytes())
    received, sent = _network_rates.read(_network_bytes())
    process_cpu, process_memory, process_threads, process_age = _process_figures()
    return SystemPerformance(
        os_name=_os_name(),
        architecture=platform.machine(),
        uptime_seconds=_uptime_seconds(),
        cpu_name=specs.cpu_name,
        cpu_cores=psutil.cpu_count(logical=False),
        cpu_threads=psutil.cpu_count() or specs.cpu_cores,
        cpu_clock_mhz=clock,
        cpu_clock_is_live=clock_live,
        cpu_load_percent=specs.cpu_load_percent,
        cpu_core_load_percents=_core_loads(),
        cpu_temperature_celsius=specs.cpu_temperature_celsius,
        cpu_power_watts=specs.cpu_power_watts,
        memory_total_bytes=specs.memory_total_bytes,
        memory_used_bytes=specs.memory_used_bytes,
        swap_total_bytes=swap_total,
        swap_used_bytes=swap_used,
        gpu_available=specs.gpu_available,
        gpu_name=specs.gpu_name,
        gpu_driver=gpu.driver,
        gpu_memory_bytes=specs.gpu_memory_bytes,
        gpu_memory_used_bytes=specs.gpu_memory_used_bytes,
        gpu_load_percent=specs.gpu_load_percent,
        gpu_temperature_celsius=specs.gpu_temperature_celsius,
        gpu_power_watts=specs.gpu_power_watts,
        gpu_power_limit_watts=specs.gpu_power_limit_watts,
        gpu_clock_mhz=gpu.clock_mhz,
        gpu_max_clock_mhz=gpu.max_clock_mhz,
        gpu_memory_clock_mhz=gpu.memory_clock_mhz,
        gpu_pcie_generation=gpu.pcie_generation,
        gpu_pcie_width=gpu.pcie_width,
        gpu_processes=gpu_memory_by_process() if specs.gpu_available else None,
        disk_read_bytes_per_second=disk_read,
        disk_write_bytes_per_second=disk_write,
        network_received_bytes_per_second=received,
        network_sent_bytes_per_second=sent,
        process_cpu_percent=process_cpu,
        process_memory_bytes=process_memory,
        process_threads=process_threads,
        process_uptime_seconds=process_age,
        disks=disk_usage(),
    )
