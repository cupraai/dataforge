from __future__ import annotations

import os
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import gpu_process_memory
from gpu_process_memory import (
    MIN_PROCESS_BYTES,
    gpu_memory_by_process,
    service_of,
    service_ports,
    windows_usage_by_pid,
)

NVIDIA = frozenset({"luid_0x00000000_0x0000fcd3"})
GB = 1024**3


def fake_process(pid: int, parents: list[int] | None = None, name: str = "python.exe"):
    process = MagicMock(pid=pid)
    process.name.return_value = name
    process.parents.return_value = [MagicMock(pid=parent) for parent in parents or []]
    return process


class WindowsCounterTests(unittest.TestCase):
    def test_counts_only_the_nvidia_adapter_and_sums_a_process_across_it(self) -> None:
        usage = {
            # Windows prints the LUID in capitals.
            "pid_100_luid_0x00000000_0x0000FCD3_phys_0": 2 * GB,
            "pid_100_luid_0x00000000_0x0000FCD3_phys_1": GB,
            # The integrated GPU's desktop compositor is someone else's memory.
            "pid_200_luid_0x00000000_0x0001100A_phys_0": GB,
            "not_a_process": GB,
        }

        self.assertEqual(windows_usage_by_pid(usage, NVIDIA), {100: 3 * GB})

    def test_a_luid_is_never_matched_by_its_prefix(self) -> None:
        usage = {"pid_100_luid_0x00000000_0x0000fcd3f_phys_0": GB}
        self.assertEqual(windows_usage_by_pid(usage, NVIDIA), {})


class ServiceTests(unittest.TestCase):
    @patch("gpu_process_memory.effective_settings")
    def test_names_only_the_services_this_machine_runs(self, settings: MagicMock) -> None:
        settings.return_value = SimpleNamespace(
            vision_base_url="http://127.0.0.1:8888/v1",
            comfy_base_url="http://localhost:8188",
            ai_toolkit_base_url="http://192.0.2.50:8675",
        )

        self.assertEqual(service_ports(), {8888: "Vision server", 8188: "ComfyUI"})

    def test_a_worker_takes_the_service_of_the_server_that_started_it(self) -> None:
        # llama-server under the Python launcher that listens on the vision port.
        worker = fake_process(30, parents=[20, 10])
        listeners = {20: {8888}, 10: {9999}}

        self.assertEqual(service_of(worker, {8888: "Vision server"}, listeners), "Vision server")
        self.assertIsNone(service_of(fake_process(40), {8888: "Vision server"}, listeners))

    def test_dataforge_and_its_children_are_dataforge(self) -> None:
        child = fake_process(55, parents=[os.getpid()])
        self.assertEqual(service_of(child, {}, {}), "DataForge")


class ByProcessTests(unittest.TestCase):
    def setUp(self) -> None:
        gpu_process_memory.clear_caches_for_tests()

    @patch("gpu_process_memory._usage_by_pid", return_value=None)
    def test_says_nothing_where_the_platform_cannot_attribute_vram(self, _usage) -> None:
        self.assertIsNone(gpu_memory_by_process())

    @patch("gpu_process_memory._listening_ports", return_value={2: {8188}})
    @patch("gpu_process_memory.service_ports", return_value={8188: "ComfyUI"})
    @patch("gpu_process_memory.psutil.Process")
    @patch("gpu_process_memory._usage_by_pid")
    def test_lists_the_largest_holders_by_name_and_service(
        self, usage, process, _ports, _listeners
    ) -> None:
        usage.return_value = {1: GB, 2: 3 * GB, 3: MIN_PROCESS_BYTES - 1}
        process.side_effect = lambda pid: fake_process(
            pid, name={1: "llama-server.exe", 2: "python.exe"}[pid]
        )

        holders = gpu_memory_by_process()

        assert holders is not None
        self.assertEqual(
            [(p.pid, p.name, p.service, p.used_bytes) for p in holders],
            [(2, "python", "ComfyUI", 3 * GB), (1, "llama-server", None, GB)],
        )

    @patch("gpu_process_memory._listening_ports", return_value={})
    @patch("gpu_process_memory.service_ports", return_value={})
    @patch("gpu_process_memory.psutil.Process")
    @patch("gpu_process_memory._usage_by_pid", return_value={7: GB})
    def test_looks_a_process_up_once_while_it_holds_memory(self, _usage, process, *_):
        process.side_effect = lambda pid: fake_process(pid)

        gpu_memory_by_process()
        gpu_memory_by_process()

        self.assertEqual(process.call_count, 1)


class NvidiaSmiTests(unittest.TestCase):
    @patch("gpu_process_memory.subprocess.run")
    def test_reads_compute_processes_in_mebibytes(self, run: MagicMock) -> None:
        run.return_value = MagicMock(returncode=0, stdout="4242, 2048\n77, [N/A]\n")
        self.assertEqual(gpu_process_memory._nvidia_smi_usage_by_pid(), {4242: 2 * GB})


if __name__ == "__main__":
    unittest.main()
