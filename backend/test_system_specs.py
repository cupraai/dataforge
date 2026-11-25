from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
import venv
from pathlib import Path
from unittest.mock import MagicMock, patch

import system_specs
from system_specs import _gpu_from_nvidia_smi, _gpu_from_torch, get_system_specs


class NvidiaSmiGpuTests(unittest.TestCase):
    @patch("system_specs.subprocess.run")
    def test_parses_name_total_and_used(self, run_mock: MagicMock) -> None:
        run_mock.return_value = MagicMock(
            returncode=0,
            stdout="NVIDIA GeForce RTX 4090, 24564, 8192, 87, 64, 312.45, 450.00, 61\n",
        )

        info = _gpu_from_nvidia_smi()

        self.assertIsNotNone(info)
        assert info is not None
        self.assertEqual(info.name, "NVIDIA GeForce RTX 4090")
        self.assertEqual(info.memory_total_bytes, (24564 * 1024 * 1024))
        self.assertEqual(info.memory_used_bytes, (8192 * 1024 * 1024))
        self.assertEqual(info.load_percent, 87.0)
        self.assertEqual(info.temperature_celsius, 64.0)
        self.assertEqual(info.power_watts, 312.45)
        self.assertEqual(info.power_limit_watts, 450.0)
        self.assertEqual(info.fan_percent, 61.0)

    @patch("system_specs.subprocess.run")
    def test_queries_only_the_fields_the_panel_shows(self, run_mock: MagicMock) -> None:
        run_mock.return_value = MagicMock(returncode=0, stdout="GPU, 100, 40, 5, 44, 30, 200, 0\n")

        _gpu_from_nvidia_smi()

        query = next(arg for arg in run_mock.call_args.args[0] if arg.startswith("--query-gpu"))
        self.assertEqual(
            query,
            "--query-gpu=name,memory.total,memory.used,utilization.gpu,temperature.gpu,"
            "power.draw,power.limit,fan.speed",
        )

    @patch("system_specs.subprocess.run")
    def test_leaves_load_unknown_when_the_card_reports_na(self, run_mock: MagicMock) -> None:
        # A passively cooled card has no fan, and some report no power sensor.
        run_mock.return_value = MagicMock(
            returncode=0, stdout="GPU, 100, 40, [N/A], [N/A], [N/A], [N/A], [N/A]\n"
        )

        info = _gpu_from_nvidia_smi()

        assert info is not None
        self.assertIsNone(info.load_percent)
        self.assertIsNone(info.temperature_celsius)
        self.assertIsNone(info.power_watts)
        self.assertIsNone(info.power_limit_watts)
        self.assertIsNone(info.fan_percent)
        self.assertEqual(info.memory_used_bytes, 40 * 1024 * 1024)

    @patch("system_specs.subprocess.run", side_effect=FileNotFoundError)
    def test_returns_none_when_smi_missing(self, _run_mock: MagicMock) -> None:
        self.assertIsNone(_gpu_from_nvidia_smi())


class TorchGpuTests(unittest.TestCase):
    def test_typechecks_without_optional_dependencies(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            venv.EnvBuilder(with_pip=False).create(directory)
            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "ty",
                    "check",
                    "system_specs.py",
                    "--python",
                    directory,
                    "--python-platform",
                    "linux",
                ],
                cwd=Path(__file__).resolve().parent,
                capture_output=True,
                text=True,
                check=False,
            )

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_returns_none_when_torch_is_not_installed(self) -> None:
        with patch.dict("sys.modules", {"torch": None}):
            self.assertIsNone(_gpu_from_torch())

    def test_returns_none_when_cuda_unavailable(self) -> None:
        torch_mock = MagicMock()
        torch_mock.cuda.is_available.return_value = False
        with patch.dict("sys.modules", {"torch": torch_mock}):
            self.assertIsNone(_gpu_from_torch())

    def test_reads_mem_get_info_when_available(self) -> None:
        torch_mock = MagicMock()
        torch_mock.cuda.is_available.return_value = True
        props = MagicMock()
        props.name = "Mock GPU"
        props.total_memory = 8 * 1024**3
        torch_mock.cuda.get_device_properties.return_value = props
        torch_mock.cuda.mem_get_info.return_value = (3 * 1024**3, 8 * 1024**3)

        with patch.dict("sys.modules", {"torch": torch_mock}):
            info = _gpu_from_torch()

        self.assertIsNotNone(info)
        assert info is not None
        self.assertEqual(info.name, "Mock GPU")
        self.assertEqual(info.memory_total_bytes, 8 * 1024**3)
        # torch reports 3 GB free of 8 GB, so 5 GB is in use.
        self.assertEqual(info.memory_used_bytes, 5 * 1024**3)


class CpuUsageTests(unittest.TestCase):
    def setUp(self) -> None:
        patcher = patch.multiple(
            system_specs, _previous_cpu_times=(100, 1000), _last_cpu_load_percent=None
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_measures_busy_share_since_the_previous_sample(self) -> None:
        # 400 of the 1000 ticks since the last sample were idle.
        with patch("system_specs._cpu_times", return_value=(500, 2000)):
            self.assertEqual(system_specs._cpu_load_percent(), 60.0)

    def test_repeats_the_last_reading_when_no_time_has_passed(self) -> None:
        with patch("system_specs._cpu_times", return_value=(500, 2000)):
            system_specs._cpu_load_percent()
            # A second request in the same tick must not blank the readout.
            self.assertEqual(system_specs._cpu_load_percent(), 60.0)

    def test_is_none_without_a_counter(self) -> None:
        with patch("system_specs._cpu_times", return_value=None):
            self.assertIsNone(system_specs._cpu_load_percent())


class CpuTemperatureTests(unittest.TestCase):
    def test_reads_the_hwmon_package_sensor(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            unrelated = Path(directory) / "hwmon0"
            unrelated.mkdir()
            (unrelated / "name").write_text("nvme", encoding="utf-8")
            (unrelated / "temp1_input").write_text("39000", encoding="utf-8")
            cpu = Path(directory) / "hwmon1"
            cpu.mkdir()
            (cpu / "name").write_text("k10temp", encoding="utf-8")
            (cpu / "temp1_input").write_text("54321", encoding="utf-8")

            with (
                patch("system_specs.sys.platform", "linux"),
                patch("system_specs.glob.glob", return_value=[str(unrelated), str(cpu)]),
            ):
                self.assertEqual(system_specs._board_sensors().cpu_temperature_celsius, 54.321)

    def test_is_none_when_no_hwmon_belongs_to_the_cpu(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            other = Path(directory) / "hwmon0"
            other.mkdir()
            (other / "name").write_text("nvme", encoding="utf-8")

            with (
                patch("system_specs.sys.platform", "linux"),
                patch("system_specs.glob.glob", return_value=[str(other)]),
            ):
                self.assertIsNone(system_specs._board_sensors().cpu_temperature_celsius)

    def test_reads_no_sensor_on_macos(self) -> None:
        with (
            patch("system_specs.sys.platform", "darwin"),
            patch("system_specs.glob.glob") as glob_mock,
        ):
            self.assertIsNone(system_specs._board_sensors().cpu_temperature_celsius)

        glob_mock.assert_not_called()


IOREG_ACCELERATORS = b"""<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<array>
  <dict>
    <key>IOClass</key><string>AGXAcceleratorG14X</string>
    <key>model</key><string>Apple M2 Pro</string>
    <key>gpu-core-count</key><integer>19</integer>
    <key>PerformanceStatistics</key>
    <dict>
      <key>Device Utilization %</key><integer>37</integer>
      <key>In use system memory</key><integer>2147483648</integer>
    </dict>
  </dict>
</array>
</plist>
"""


class AppleGpuTests(unittest.TestCase):
    def test_reads_name_load_and_memory_in_use(self) -> None:
        info = system_specs.parse_ioreg_accelerators(IOREG_ACCELERATORS, 32 * 1024**3)

        self.assertEqual(
            info,
            system_specs._GpuInfo(
                name="Apple M2 Pro",
                memory_total_bytes=32 * 1024**3,
                memory_used_bytes=2 * 1024**3,
                load_percent=37.0,
                temperature_celsius=None,
            ),
        )

    def test_skips_an_accelerator_without_a_name(self) -> None:
        nameless = IOREG_ACCELERATORS.replace(b"<key>model</key><string>Apple M2 Pro</string>", b"")

        self.assertIsNone(system_specs.parse_ioreg_accelerators(nameless, 1))

    def test_is_none_for_output_that_is_not_a_plist(self) -> None:
        for data in (b"", b"not xml", b"<plist><dict></dict></plist>"):
            with self.subTest(data=data):
                self.assertIsNone(system_specs.parse_ioreg_accelerators(data, 1))

    def test_asks_ioreg_only_on_macos(self) -> None:
        with (
            patch("system_specs.sys.platform", "linux"),
            patch("system_specs.subprocess.run") as run_mock,
        ):
            self.assertIsNone(system_specs._gpu_from_ioreg(1))

        run_mock.assert_not_called()


class MacCpuLoadTests(unittest.TestCase):
    def test_reads_idle_and_total_ticks_from_mach(self) -> None:
        # user, system, idle, nice
        with (
            patch("system_specs.sys.platform", "darwin"),
            patch("system_specs._macos_cpu_ticks", return_value=(200, 100, 650, 50)),
        ):
            self.assertEqual(system_specs._cpu_times(), (650, 1000))

    def test_a_failed_read_leaves_the_load_unknown(self) -> None:
        with (
            patch("system_specs.sys.platform", "darwin"),
            patch("system_specs._macos_cpu_ticks", side_effect=OSError("host_statistics failed")),
        ):
            self.assertIsNone(system_specs._cpu_times())


class LinuxCpuPowerTests(unittest.TestCase):
    def setUp(self) -> None:
        patcher = patch.multiple(
            system_specs, _previous_rapl_sample=(1_000_000, 10.0), _last_cpu_power_watts=None
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_averages_package_energy_since_the_previous_sample(self) -> None:
        # 130 J over two seconds.
        with patch("system_specs._rapl_sample", return_value=(131_000_000, 12.0)):
            self.assertEqual(system_specs._linux_cpu_power_watts(), 65.0)

    def test_survives_the_counter_wrapping(self) -> None:
        with (
            patch.object(system_specs, "_previous_rapl_sample", (95_000_000, 10.0)),
            patch("system_specs._rapl_sample", return_value=(3_000_000, 12.0)),
            patch("system_specs._read_int", return_value=100_000_000),
        ):
            # (100 - 95 + 3) J over two seconds.
            self.assertEqual(system_specs._linux_cpu_power_watts(), 4.0)

    def test_is_none_when_the_counter_is_root_only(self) -> None:
        with patch("system_specs._rapl_sample", return_value=None):
            self.assertIsNone(system_specs._linux_cpu_power_watts())


class WindowsSensorFileTests(unittest.TestCase):
    def setUp(self) -> None:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.program_data = Path(directory.name)
        self.sensor_file = self.program_data / "DataForge" / "sensors" / "sensors.json"
        patcher = patch.dict("os.environ", {"PROGRAMDATA": str(self.program_data)})
        patcher.start()
        self.addCleanup(patcher.stop)

    def write_sensor_file(self, content: str, age_seconds: float = 0) -> None:
        self.sensor_file.parent.mkdir(parents=True, exist_ok=True)
        self.sensor_file.write_text(content, encoding="utf-8")
        written_at = time.time() - age_seconds
        os.utime(self.sensor_file, (written_at, written_at))

    def read_on_windows(self) -> system_specs._BoardSensors:
        with patch("system_specs.sys.platform", "win32"):
            return system_specs._board_sensors()

    def write_readings(self, age_seconds: float = 0, **readings: object) -> None:
        self.write_sensor_file(json.dumps(readings), age_seconds)

    def test_reads_the_published_readings(self) -> None:
        self.write_readings(cpu_temperature_celsius=59.25, cpu_power_watts=88.5)

        self.assertEqual(self.read_on_windows(), system_specs._BoardSensors(59.25, 88.5))

    def test_keeps_the_temperature_when_power_is_unknown(self) -> None:
        # The first round after the task starts has no power figure yet.
        self.write_readings(cpu_temperature_celsius=59.25, cpu_power_watts=None)

        self.assertEqual(self.read_on_windows(), system_specs._BoardSensors(59.25))

    def test_skips_malformed_entries(self) -> None:
        self.write_readings(
            cpu_temperature_celsius="hot",
            cpu_power_watts=True,
        )

        self.assertEqual(self.read_on_windows(), system_specs._BoardSensors())

    def test_ignores_readings_the_stopped_task_left_behind(self) -> None:
        self.write_readings(age_seconds=30, cpu_temperature_celsius=59.25)

        self.assertEqual(self.read_on_windows(), system_specs._BoardSensors())

    def test_is_empty_without_the_sensor_task_installed(self) -> None:
        self.assertEqual(self.read_on_windows(), system_specs._BoardSensors())

    def test_is_empty_when_the_file_is_not_json(self) -> None:
        self.write_sensor_file("59.25,")

        self.assertEqual(self.read_on_windows(), system_specs._BoardSensors())

    def test_is_empty_without_a_program_data_folder(self) -> None:
        self.write_readings(cpu_temperature_celsius=59.25)

        with patch.dict("os.environ", clear=True):
            self.assertEqual(self.read_on_windows(), system_specs._BoardSensors())


class SystemMemoryTests(unittest.TestCase):
    @patch("system_specs._gpu_info", return_value=None)
    @patch("system_specs._memory_bytes", return_value=(32 * 1024**3, 24 * 1024**3))
    def test_reports_used_memory_rather_than_available(
        self,
        _memory_mock: MagicMock,
        _gpu_mock: MagicMock,
    ) -> None:
        """The platform APIs report free memory; the panel wants used, like it shows for VRAM."""
        specs = get_system_specs()

        self.assertEqual(specs.memory_total_bytes, 32 * 1024**3)
        self.assertEqual(specs.memory_used_bytes, 8 * 1024**3)


if __name__ == "__main__":
    unittest.main()
