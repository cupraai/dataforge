from __future__ import annotations

import unittest
from collections import namedtuple
from dataclasses import asdict
from unittest.mock import MagicMock, patch

import system_performance
from schemas import SystemPerformanceResponse
from system_performance import _RateMeter, disk_usage, get_system_performance, gpu_details

Partition = namedtuple("Partition", "device mountpoint fstype opts")
Usage = namedtuple("Usage", "total used free percent")
NetCounter = namedtuple("NetCounter", "bytes_sent bytes_recv")


class GpuDetailTests(unittest.TestCase):
    @patch("system_performance.subprocess.run")
    def test_reads_driver_clocks_and_link(self, run_mock: MagicMock) -> None:
        run_mock.return_value = MagicMock(returncode=0, stdout="580.12, 2520, 3090, 14001, 4, 16\n")

        details = gpu_details()

        self.assertEqual(details.driver, "580.12")
        self.assertEqual((details.clock_mhz, details.max_clock_mhz), (2520.0, 3090.0))
        self.assertEqual(details.memory_clock_mhz, 14001.0)
        self.assertEqual((details.pcie_generation, details.pcie_width), (4, 16))

    @patch("system_performance.subprocess.run")
    def test_leaves_unreported_figures_unknown(self, run_mock: MagicMock) -> None:
        run_mock.return_value = MagicMock(
            returncode=0, stdout="580.12, [N/A], [N/A], [N/A], [N/A], [N/A]\n"
        )

        details = gpu_details()

        self.assertEqual(details.driver, "580.12")
        self.assertIsNone(details.clock_mhz)
        self.assertIsNone(details.pcie_generation)

    @patch("system_performance.subprocess.run")
    def test_an_older_driver_that_refuses_the_query_reports_nothing(self, run_mock) -> None:
        run_mock.return_value = MagicMock(returncode=2, stdout="")
        self.assertEqual(gpu_details(), system_performance.GpuDetails())

    @patch("system_performance.subprocess.run", side_effect=FileNotFoundError)
    def test_no_nvidia_smi_reports_nothing(self, _run_mock: MagicMock) -> None:
        self.assertEqual(gpu_details(), system_performance.GpuDetails())


class DiskUsageTests(unittest.TestCase):
    @patch("system_performance.sys.platform", "win32")
    @patch("system_performance.psutil.disk_usage", return_value=Usage(1000, 400, 600, 40.0))
    @patch("system_performance.psutil.disk_partitions")
    def test_lists_fixed_drives_by_letter(self, partitions, _usage) -> None:
        partitions.return_value = [
            Partition("C:\\", "C:\\", "NTFS", "rw,fixed"),
            Partition("E:\\", "E:\\", "", "cdrom"),
            Partition("D:\\", "D:\\", "NTFS", "rw,fixed"),
        ]

        disks = disk_usage()

        self.assertEqual([disk.name for disk in disks], ["C:", "D:"])
        self.assertEqual((disks[0].total_bytes, disks[0].used_bytes), (1000, 400))

    @patch("system_performance.sys.platform", "linux")
    @patch("system_performance.psutil.disk_usage", return_value=Usage(1000, 1, 999, 0.1))
    @patch("system_performance.psutil.disk_partitions")
    def test_skips_images_and_a_device_mounted_twice(self, partitions, _usage) -> None:
        partitions.return_value = [
            Partition("/dev/nvme0n1p2", "/", "ext4", "rw"),
            Partition("/dev/loop3", "/snap/core/1", "squashfs", "ro"),
            Partition("/dev/nvme0n1p2", "/var/lib/docker", "ext4", "rw"),
            Partition("/dev/sda1", "/mnt/media", "ext4", "rw"),
        ]

        self.assertEqual([disk.name for disk in disk_usage()], ["/", "/mnt/media"])

    @patch("system_performance.psutil.disk_usage", side_effect=PermissionError)
    @patch("system_performance.psutil.disk_partitions")
    def test_a_drive_that_cannot_be_read_is_left_out(self, partitions, _usage) -> None:
        partitions.return_value = [Partition("X:\\", "X:\\", "NTFS", "rw,fixed")]
        self.assertEqual(disk_usage(), [])


class RateMeterTests(unittest.TestCase):
    @patch("system_performance.time.monotonic")
    def test_rates_cover_the_time_since_the_previous_read(self, clock: MagicMock) -> None:
        meter = _RateMeter()
        clock.return_value = 10.0
        self.assertEqual(meter.read((1_000, 5_000)), (None, None))

        clock.return_value = 12.0
        self.assertEqual(meter.read((5_000, 6_000)), (2_000.0, 500.0))

    @patch("system_performance.time.monotonic")
    def test_a_read_moments_after_the_last_repeats_its_rates(self, clock: MagicMock) -> None:
        meter = _RateMeter()
        clock.return_value = 10.0
        meter.read((0, 0))
        clock.return_value = 11.0
        meter.read((1_000, 1_000))

        # The counters have not ticked yet; this is not a second of silence.
        clock.return_value = 11.005
        self.assertEqual(meter.read((1_000, 1_000)), (1_000.0, 1_000.0))
        clock.return_value = 12.0
        self.assertEqual(meter.read((3_000, 1_000)), (2_000.0, 0.0))

    @patch("system_performance.time.monotonic")
    def test_a_reset_counter_reads_zero_not_negative(self, clock: MagicMock) -> None:
        meter = _RateMeter()
        clock.return_value = 1.0
        meter.read((9_000, 9_000))
        clock.return_value = 2.0
        self.assertEqual(meter.read((100, 9_500)), (0.0, 500.0))


class NetworkTests(unittest.TestCase):
    @patch("system_performance.psutil.net_io_counters")
    def test_leaves_out_the_loopback_this_page_polls_over(self, counters: MagicMock) -> None:
        counters.return_value = {
            "Ethernet": NetCounter(bytes_sent=10, bytes_recv=20),
            "Loopback Pseudo-Interface 1": NetCounter(bytes_sent=999, bytes_recv=999),
            "lo": NetCounter(bytes_sent=999, bytes_recv=999),
        }
        self.assertEqual(system_performance._network_bytes(), (20, 10))


class SystemPerformanceTests(unittest.TestCase):
    def setUp(self) -> None:
        system_performance.reset_rates_for_tests()

    @patch("system_performance.gpu_details")
    def test_reads_this_machine_into_the_wire_shape(self, details: MagicMock) -> None:
        details.return_value = system_performance.GpuDetails()

        first = SystemPerformanceResponse.model_validate(asdict(get_system_performance()))
        second = SystemPerformanceResponse.model_validate(asdict(get_system_performance()))

        self.assertGreater(first.cpu_threads, 0)
        self.assertGreater(first.memory_total_bytes, 0)
        self.assertEqual(len(second.cpu_core_load_percents), second.cpu_threads)
        self.assertIsNotNone(second.process_memory_bytes)
        # Rates need a previous read.
        self.assertIsNone(first.disk_read_bytes_per_second)

    @patch("system_performance.gpu_details")
    @patch("system_performance.get_system_specs")
    def test_asks_nvidia_smi_for_details_only_when_there_is_a_gpu(self, specs, details) -> None:
        from system_specs import SystemSpecs

        specs.return_value = SystemSpecs(
            cpu_name="CPU",
            cpu_cores=4,
            cpu_load_percent=None,
            cpu_temperature_celsius=None,
            cpu_power_watts=None,
            memory_total_bytes=100,
            memory_used_bytes=50,
            gpu_name=None,
            gpu_memory_bytes=None,
            gpu_memory_used_bytes=None,
            gpu_load_percent=None,
            gpu_temperature_celsius=None,
            gpu_power_watts=None,
            gpu_power_limit_watts=None,
            gpu_fan_percent=None,
            gpu_available=False,
        )

        performance = get_system_performance()

        details.assert_not_called()
        self.assertFalse(performance.gpu_available)
        self.assertIsNone(performance.gpu_driver)


if __name__ == "__main__":
    unittest.main()
