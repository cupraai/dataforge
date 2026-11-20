"""VRAM per process on the NVIDIA card, named after the service it serves where it is one.

Windows (WDDM) leaves nvidia-smi's per-process figure at ``[N/A]``, so there it comes from the
``GPU Process Memory`` counters, narrowed to the NVIDIA adapter that DXGI names. Elsewhere
nvidia-smi reports it directly.
"""

from __future__ import annotations

import contextlib
import ipaddress
import os
import subprocess
import sys
import time
from dataclasses import dataclass
from functools import cache
from typing import Any
from urllib.parse import urlsplit

import psutil

from app_settings import effective_settings

#: Smaller holders are left to "other": a browser tab's few megabytes say nothing.
MIN_PROCESS_BYTES = 16 * 1024 * 1024
MAX_PROCESSES = 8
NVIDIA_VENDOR_ID = 0x10DE

#: Which process listens where barely changes; looking it up costs a full socket table.
_LISTENERS_MAX_AGE_SECONDS = 5.0
#: Walking a process's parents costs ~100 ms on Windows, so its service is kept a while.
_SERVICE_MAX_AGE_SECONDS = 30.0


@dataclass(frozen=True)
class GpuProcessMemory:
    pid: int
    name: str
    #: The configured service this process (or one it was started by) serves.
    service: str | None
    used_bytes: int


def _windows_nvidia_luids() -> set[str]:
    """Counter-instance LUIDs (``luid_0x<high>_0x<low>``) of the NVIDIA adapters."""
    if sys.platform != "win32":
        return set()

    import ctypes
    from ctypes import wintypes

    class LUID(ctypes.Structure):
        _fields_ = [("LowPart", wintypes.DWORD), ("HighPart", wintypes.LONG)]

    class DXGI_ADAPTER_DESC1(ctypes.Structure):
        _fields_ = [
            ("Description", wintypes.WCHAR * 128),
            ("VendorId", wintypes.UINT),
            ("DeviceId", wintypes.UINT),
            ("SubSysId", wintypes.UINT),
            ("Revision", wintypes.UINT),
            ("DedicatedVideoMemory", ctypes.c_size_t),
            ("DedicatedSystemMemory", ctypes.c_size_t),
            ("SharedSystemMemory", ctypes.c_size_t),
            ("AdapterLuid", LUID),
            ("Flags", wintypes.UINT),
        ]

    class GUID(ctypes.Structure):
        _fields_ = [
            ("Data1", wintypes.DWORD),
            ("Data2", wintypes.WORD),
            ("Data3", wintypes.WORD),
            ("Data4", ctypes.c_ubyte * 8),
        ]

    # IID_IDXGIFactory1 {770aae78-f26f-4dba-a829-253c83d1b387}
    iid = GUID(
        0x770AAE78,
        0xF26F,
        0x4DBA,
        (ctypes.c_ubyte * 8)(0xA8, 0x29, 0x25, 0x3C, 0x83, 0xD1, 0xB3, 0x87),
    )

    def method(obj: ctypes.c_void_p, index: int, *argtypes: Any):
        vtable = ctypes.cast(obj, ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p))).contents
        return ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.c_void_p, *argtypes)(vtable[index])

    # COM vtable slots: IUnknown 0-2, IDXGIObject 3-6, IDXGIFactory 7-11, EnumAdapters1 12;
    # IDXGIAdapter 7-9, GetDesc1 10.
    release, enum_adapters1, get_desc1 = 2, 12, 10
    factory = ctypes.c_void_p()
    if ctypes.windll.dxgi.CreateDXGIFactory1(ctypes.byref(iid), ctypes.byref(factory)) != 0:
        return set()
    luids: set[str] = set()
    try:
        for index in range(16):
            adapter = ctypes.c_void_p()
            enum = method(factory, enum_adapters1, wintypes.UINT, ctypes.c_void_p)
            if enum(factory, index, ctypes.byref(adapter)) != 0:
                break
            try:
                desc = DXGI_ADAPTER_DESC1()
                get = method(adapter, get_desc1, ctypes.c_void_p)
                if get(adapter, ctypes.byref(desc)) == 0 and desc.VendorId == NVIDIA_VENDOR_ID:
                    high = desc.AdapterLuid.HighPart & 0xFFFFFFFF
                    luids.add(f"luid_0x{high:08x}_0x{desc.AdapterLuid.LowPart:08x}")
            finally:
                method(adapter, release)(adapter)
    finally:
        method(factory, release)(factory)
    return luids


@cache
def _nvidia_luids() -> frozenset[str]:
    # Adapters are fixed for the life of the process; a hot-plugged eGPU waits for a restart.
    try:
        return frozenset(_windows_nvidia_luids())
    except (OSError, AttributeError, ValueError):
        return frozenset()


def _windows_dedicated_usage() -> dict[str, int]:
    """``GPU Process Memory(*)\\Dedicated Usage`` by counter instance name."""
    if sys.platform != "win32":
        return {}

    import ctypes
    from ctypes import wintypes

    class PDH_FMT_COUNTERVALUE(ctypes.Structure):
        class _Value(ctypes.Union):
            _fields_ = [
                ("longValue", ctypes.c_long),
                ("doubleValue", ctypes.c_double),
                ("largeValue", ctypes.c_longlong),
            ]

        _fields_ = [("CStatus", wintypes.DWORD), ("value", _Value)]

    class PDH_FMT_COUNTERVALUE_ITEM_W(ctypes.Structure):
        _fields_ = [("szName", ctypes.c_wchar_p), ("FmtValue", PDH_FMT_COUNTERVALUE)]

    pdh_fmt_large = 0x00000400
    pdh_more_data = 0x800007D2
    pdh = ctypes.windll.pdh
    query = wintypes.HANDLE()
    counter = wintypes.HANDLE()
    if pdh.PdhOpenQueryW(None, None, ctypes.byref(query)) != 0:
        return {}
    try:
        path = "\\GPU Process Memory(*)\\Dedicated Usage"
        if pdh.PdhAddEnglishCounterW(query, path, None, ctypes.byref(counter)) != 0:
            return {}
        if pdh.PdhCollectQueryData(query) != 0:
            return {}
        size = wintypes.DWORD(0)
        count = wintypes.DWORD(0)
        status = pdh.PdhGetFormattedCounterArrayW(
            counter, pdh_fmt_large, ctypes.byref(size), ctypes.byref(count), None
        )
        if status & 0xFFFFFFFF != pdh_more_data or size.value == 0:
            return {}
        buffer = (ctypes.c_byte * size.value)()
        status = pdh.PdhGetFormattedCounterArrayW(
            counter, pdh_fmt_large, ctypes.byref(size), ctypes.byref(count), buffer
        )
        if status != 0:
            return {}
        items = ctypes.cast(buffer, ctypes.POINTER(PDH_FMT_COUNTERVALUE_ITEM_W * count.value))
        return {
            item.szName: int(item.FmtValue.value.largeValue)
            for item in items.contents
            if item.szName and item.FmtValue.CStatus == 0
        }
    finally:
        pdh.PdhCloseQuery(query)


def _pid_of_instance(instance: str) -> int | None:
    # ``pid_1234_luid_0x00000000_0x0000fcd3_phys_0``
    parts = instance.split("_")
    if len(parts) < 2 or parts[0] != "pid":
        return None
    try:
        return int(parts[1])
    except ValueError:
        return None


def windows_usage_by_pid(usage: dict[str, int], luids: frozenset[str]) -> dict[int, int]:
    """Sums each process's dedicated memory on the given adapters."""
    by_pid: dict[int, int] = {}
    # Windows writes the LUID's hex in capitals; DXGI's numbers carry no case.
    wanted = {luid.lower() for luid in luids}
    for instance, used in usage.items():
        pid = _pid_of_instance(instance)
        name = f"{instance.lower()}_"
        if pid is None or not any(f"_{luid}_" in name for luid in wanted):
            continue
        by_pid[pid] = by_pid.get(pid, 0) + used
    return by_pid


def _nvidia_smi_usage_by_pid() -> dict[int, int] | None:
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-compute-apps=pid,used_memory",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return None
    if result.returncode != 0:
        return None
    by_pid: dict[int, int] = {}
    for line in result.stdout.strip().splitlines():
        pid_text, _, used_text = line.partition(",")
        try:
            pid = int(pid_text.strip())
            used = int(float(used_text.strip()) * 1024 * 1024)
        except ValueError:
            continue
        by_pid[pid] = by_pid.get(pid, 0) + used
    return by_pid


def _usage_by_pid() -> dict[int, int] | None:
    """``None`` where this platform cannot say."""
    if sys.platform == "win32":
        luids = _nvidia_luids()
        if not luids:
            return None
        try:
            usage = _windows_dedicated_usage()
        except (OSError, AttributeError, ValueError):
            return None
        return windows_usage_by_pid(usage, luids) if usage else None
    if sys.platform.startswith("linux"):
        return _nvidia_smi_usage_by_pid()
    return None


def _local_addresses() -> set[str]:
    addresses = {"localhost", "127.0.0.1", "::1", "0.0.0.0", "::"}
    try:
        for entries in psutil.net_if_addrs().values():
            addresses.update(entry.address.split("%")[0] for entry in entries)
    except (OSError, RuntimeError):
        pass
    return addresses


def service_ports() -> dict[int, str]:
    """Ports of the configured services that run on this machine, by service name."""
    settings = effective_settings()
    services = {
        "Vision server": settings.vision_base_url,
        "ComfyUI": settings.comfy_base_url,
        "AI-Toolkit": settings.ai_toolkit_base_url,
    }
    local = _local_addresses()
    ports: dict[int, str] = {}
    for name, url in services.items():
        try:
            parts = urlsplit(url)
            port = parts.port or (443 if parts.scheme == "https" else 80)
        except ValueError:
            continue
        host = (parts.hostname or "").lower()
        # Written forms of one address (``::0001``, ``127.000.000.001``) compare as one.
        with contextlib.suppress(ValueError):
            host = str(ipaddress.ip_address(host))
        if host in local:
            ports.setdefault(port, name)
    return ports


_listeners: tuple[float, dict[int, set[int]]] | None = None


def _listening_ports() -> dict[int, set[int]]:
    """Listening TCP ports by pid, reread every few seconds."""
    global _listeners
    now = time.monotonic()
    if _listeners is not None and now - _listeners[0] < _LISTENERS_MAX_AGE_SECONDS:
        return _listeners[1]
    by_pid: dict[int, set[int]] = {}
    try:
        for connection in psutil.net_connections(kind="tcp"):
            if connection.status == psutil.CONN_LISTEN and connection.pid and connection.laddr:
                by_pid.setdefault(connection.pid, set()).add(connection.laddr.port)
    except (psutil.Error, OSError):
        pass
    _listeners = (now, by_pid)
    return by_pid


def service_of(process: psutil.Process, ports: dict[int, str], listeners: dict[int, set[int]]):
    """The service a process serves, or that the process which started it serves.

    A server often hands the GPU work to a child (llama-server under a Python launcher), so
    the listening port can sit on an ancestor.
    """
    try:
        chain = [process, *process.parents()]
    except psutil.Error:
        chain = [process]
    for member in chain:
        if member.pid == os.getpid():
            return "DataForge"
        for port in listeners.get(member.pid, ()):
            if port in ports:
                return ports[port]
    return None


def _display_name(process: psutil.Process) -> str:
    try:
        name = process.name()
    except psutil.Error:
        return f"Process {process.pid}"
    return name[:-4] if name.lower().endswith(".exe") else name


#: ``pid -> (looked up at, display name, service)``.
_services: dict[int, tuple[float, str, str | None]] = {}


def clear_caches_for_tests() -> None:
    global _listeners
    _listeners = None
    _services.clear()


def gpu_memory_by_process() -> list[GpuProcessMemory] | None:
    """Largest holders first; ``None`` where per-process figures cannot be read."""
    usage = _usage_by_pid()
    if usage is None:
        return None
    holders = sorted(
        ((pid, used) for pid, used in usage.items() if used >= MIN_PROCESS_BYTES),
        key=lambda entry: entry[1],
        reverse=True,
    )[:MAX_PROCESSES]
    if not holders:
        return []
    now = time.monotonic()
    processes: list[GpuProcessMemory] = []
    for pid, used in holders:
        cached = _services.get(pid)
        if cached is None or now - cached[0] > _SERVICE_MAX_AGE_SECONDS:
            try:
                process = psutil.Process(pid)
            except psutil.Error:
                continue
            cached = (
                now,
                _display_name(process),
                service_of(process, service_ports(), _listening_ports()),
            )
            _services[pid] = cached
        processes.append(
            GpuProcessMemory(pid=pid, name=cached[1], service=cached[2], used_bytes=used)
        )
    # Forget processes that have let go, so a reused pid is looked up afresh.
    for pid in _services.keys() - {pid for pid, _ in holders}:
        del _services[pid]
    return processes
