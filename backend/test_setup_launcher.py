"""Windows setup uses portable zips, never a global interpreter, and forces TLS 1.2."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SETUP_BAT = ROOT / "setup.bat"
SETUP_PS1 = ROOT / "setup.ps1"
START_BAT = ROOT / "start.bat"
START_PS1 = ROOT / "start.ps1"
DEV_COMMON = ROOT / "scripts" / "dev-common.ps1"
DEV_COMMON_SH = ROOT / "scripts" / "dev-common.sh"
DEV_PS1 = ROOT / "dev.ps1"
DEV_SH = ROOT / "dev.sh"
SETUP_SH = ROOT / "setup.sh"
START_FRONTEND_PS1 = ROOT / "start-frontend.ps1"
START_SH = ROOT / "start.sh"
INSTALL_HOOKS_PS1 = ROOT / "scripts" / "install-git-hooks.ps1"
INSTALL_HOOKS_SH = ROOT / "scripts" / "install-git-hooks.sh"
UPDATE_SH = ROOT / "update.sh"
CONSOLE_PS1 = ROOT / "scripts" / "console.ps1"
CONSOLE_SH = ROOT / "scripts" / "console.sh"
POWERSHELL_SCRIPTS = (
    ROOT / "setup.ps1",
    ROOT / "start.ps1",
    ROOT / "dev.ps1",
    ROOT / "stop.ps1",
    ROOT / "update.ps1",
    ROOT / "start-backend.ps1",
    ROOT / "start-frontend.ps1",
    ROOT / "scripts" / "dev-common.ps1",
    ROOT / "scripts" / "install-git-hooks.ps1",
    ROOT / "scripts" / "install-hardware-sensors.ps1",
)
BASH_SCRIPTS = (
    ROOT / "setup.sh",
    ROOT / "start.sh",
    ROOT / "dev.sh",
    ROOT / "stop.sh",
    ROOT / "update.sh",
    ROOT / "scripts" / "dev-common.sh",
    ROOT / "scripts" / "install-git-hooks.sh",
)


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


class SetupBatShimTests(unittest.TestCase):
    def test_setup_bat_exists(self) -> None:
        self.assertTrue(SETUP_BAT.is_file())

    def test_setup_bat_runs_setup_ps1_with_execution_policy_bypass(self) -> None:
        text = _read(SETUP_BAT)
        self.assertIn("ExecutionPolicy Bypass", text)
        self.assertIn("setup.ps1", text)
        self.assertIn("-File", text)

    def test_setup_bat_does_not_download_or_run_the_python_installer(self) -> None:
        text = _read(SETUP_BAT)
        self.assertNotIn("python-installer.exe", text)
        self.assertNotIn("python-%PY_VER%-amd64.exe", text)


class SetupPs1BootstrapTests(unittest.TestCase):
    def test_checks_the_pinned_ffmpeg_after_installing_backend_dependencies(self) -> None:
        text = _read(SETUP_PS1)
        self.assertLess(text.index("requirements.txt"), text.index("check_ffmpeg.py"))
        self.assertLess(text.index("check_ffmpeg.py"), text.index("generate_types.py"))

    def test_unix_setup_checks_the_pinned_ffmpeg_before_reporting_success(self) -> None:
        text = _read(SETUP_SH)
        self.assertLess(text.index("requirements.txt"), text.index("check_ffmpeg.py"))
        self.assertLess(text.index("check_ffmpeg.py"), text.index("Setup complete"))

    def test_setup_ps1_exists(self) -> None:
        self.assertTrue(SETUP_PS1.is_file())

    def test_forces_tls12_before_any_download(self) -> None:
        text = _read(SETUP_PS1)
        self.assertIn("[Net.SecurityProtocolType]::Tls12", text)
        tls_at = text.index("[Net.SecurityProtocolType]::Tls12")
        download_at = min(
            at for token in ("Invoke-WebRequest", "curl.exe") if (at := text.find(token)) >= 0
        )
        self.assertLess(tls_at, download_at)

    def test_python_comes_from_the_nuget_zip_not_the_installer(self) -> None:
        text = _read(SETUP_PS1)
        self.assertIn("nuget.org", text)
        self.assertIn("package/{0}", text)
        self.assertIn("PythonPackage = 'python'", text)
        self.assertNotIn("python-installer.exe", text)
        self.assertNotIn("-amd64.exe", text)
        self.assertNotIn("/quiet", text)

    def test_node_comes_from_the_official_zip(self) -> None:
        text = _read(SETUP_PS1)
        self.assertIn("nodejs.org/dist/", text)
        self.assertIn("win-x64", text)
        self.assertIn(".zip", text)

    def test_never_invokes_python_or_npm_from_path(self) -> None:
        text = _read(SETUP_PS1)
        for line in text.splitlines():
            stripped = line.split("#", 1)[0].strip()
            if not stripped:
                continue
            self.assertIsNone(
                re.search(r"(^|[|&;])\s*python(\s|$|\.exe)", stripped),
                msg=f"setup.ps1 must not call PATH python: {line}",
            )
            self.assertIsNone(
                re.search(r"(^|[|&;])\s*npm(\s|$|\.cmd)", stripped),
                msg=f"setup.ps1 must not call PATH npm: {line}",
            )

    def test_creates_the_venv_with_the_downloaded_python(self) -> None:
        text = _read(SETUP_PS1)
        self.assertIn("-FilePath $PyExe -ArgumentList @('-m', 'venv'", text)
        self.assertIn(".python", text)
        self.assertIn("backend\\.venv", text)

    def test_generates_frontend_types_after_installing_deps(self) -> None:
        text = _read(SETUP_PS1)
        gen_at = text.index("generate_types.py")
        pip_at = text.index("requirements.txt")
        npm_at = text.index("npm ci")
        self.assertLess(pip_at, gen_at)
        self.assertLess(npm_at, gen_at)

    def test_prepends_local_python_and_node_to_path(self) -> None:
        text = _read(SETUP_PS1)
        self.assertIn(".python", text)
        self.assertIn(".node", text)
        self.assertRegex(text, r"\$env:PATH\s*=")


class SetupDownloadTests(unittest.TestCase):
    def _function(self, name: str) -> str:
        text = _read(SETUP_PS1)
        start = text.index(f"function {name} ")
        return text[start : text.index("\nfunction ", start + 1)]

    def test_every_runtime_download_is_checked_against_a_published_digest(self) -> None:
        for name, source in (
            ("Install-PortablePython", "Get-NuGetPackageHash"),
            ("Install-PortableNode", "Get-NodeArchiveHash"),
            ("Install-PortableFfmpeg", "$FfmpegSha256"),
        ):
            with self.subTest(function=name):
                body = self._function(name)
                self.assertIn(source, body)
                self.assertLess(body.index("Get-RemoteFile"), body.index("Assert-FileHash"))
                self.assertLess(body.index("Assert-FileHash"), body.index("Expand-Archive"))

    def test_downloads_retry_and_time_out(self) -> None:
        body = self._function("Get-RemoteFile")
        self.assertIn("'--retry'", body)
        self.assertIn("'--connect-timeout'", body)


class SafetyGuardTests(unittest.TestCase):
    def test_ports_are_freed_only_from_this_projects_processes(self) -> None:
        powershell = _read(DEV_COMMON)
        clear = powershell[powershell.index("function Clear-DevPort") :]
        self.assertIn("Test-DevOwnedProcess", clear)
        self.assertNotIn("'pythonw'", powershell)
        self.assertIn("Test-DevOwnedProcess", _read(ROOT / "update.ps1"))
        bash = _read(DEV_COMMON_SH)
        self.assertIn("process_is_ours", bash[bash.index("clear_port() {") :])
        self.assertNotIn("python[0-9]*", bash)
        self.assertIn("process_is_ours", _read(UPDATE_SH))

    def test_windows_launchers_refuse_paths_npm_cannot_run_from(self) -> None:
        self.assertIn("Get-DevRootPathProblem", _read(SETUP_PS1))
        text = _read(DEV_COMMON)
        prerequisites = text[text.index("function Test-DevPrerequisites") :]
        self.assertIn("Get-DevRootPathProblem", prerequisites)

    def test_a_broken_venv_is_reported_before_anything_runs_it(self) -> None:
        text = _read(DEV_COMMON)
        self.assertIn("Test-DevVenvWorks", text[text.index("function Test-DevPrerequisites") :])
        generate = text[text.index("function Update-DevGeneratedSources") :]
        self.assertIn("Test-DevVenvWorks", generate[: generate.index("Invoke-ConsoleStep")])
        # PowerShell 5.1 drops an empty native argument, so -c '' would always fail.
        self.assertNotIn("-c ''", text)

    def test_unix_update_is_parsed_whole_before_the_pull_rewrites_it(self) -> None:
        text = _read(UPDATE_SH)
        self.assertIn("\nmain() {", text)
        self.assertTrue(text.rstrip().endswith('main "$@"'))

    def test_batch_files_check_out_with_crlf(self) -> None:
        self.assertIn("*.bat text eol=crlf", _read(ROOT / ".gitattributes"))


class StartLauncherBootstrapTests(unittest.TestCase):
    def test_start_bat_bypasses_execution_policy(self) -> None:
        text = _read(START_BAT)
        self.assertIn("ExecutionPolicy Bypass", text)
        self.assertIn("start.ps1", text)

    def test_npm_prefers_the_portable_copy_from_setup(self) -> None:
        text = _read(DEV_COMMON)
        start = text.index("function Get-NpmCommand")
        end = text.index("$DevGeneratedSources")
        body = text[start:end]
        self.assertIn(".node", body)
        self.assertIn("npm.cmd", body)

    def test_frontend_build_uses_the_portable_npm(self) -> None:
        text = _read(DEV_COMMON)
        self.assertIn("Get-NpmCommand", text)
        self.assertIn("run build", text)
        self.assertNotRegex(
            text,
            r"(^|[|&;])\s*&?\s*npm\.cmd\s+run\s+build",
        )

    def test_portable_npm_puts_node_on_path(self) -> None:
        text = _read(DEV_COMMON)
        start = text.index("function Get-NpmCommand")
        end = text.index("$DevGeneratedSources")
        body = text[start:end]
        self.assertIn(".node", body)
        self.assertIn("$env:PATH", body)

    def test_start_ps1_does_not_call_path_python(self) -> None:
        text = _read(START_PS1)
        self.assertIn("VenvPy", text)
        self.assertNotRegex(text, r"(^|[|&;])\s*python(\s|$)")


class FrontendLockfileTests(unittest.TestCase):
    def test_setup_scripts_install_the_locked_frontend_dependency_tree(self) -> None:
        self.assertIn("-FilePath $NpmCmd", _read(SETUP_PS1))
        self.assertIn("{ 'ci' } else { 'install' }", _read(SETUP_PS1))
        self.assertIn("NPM_VERB=ci; else NPM_VERB=install", _read(SETUP_SH))

    def test_shared_launch_helpers_resync_changed_lockfiles_with_npm_ci(self) -> None:
        for path, function_name in (
            (DEV_COMMON, "Sync-FrontendDependencies"),
            (DEV_COMMON_SH, "sync_frontend_dependencies"),
        ):
            text = _read(path)
            self.assertIn(function_name, text)
            self.assertIn("package-lock.json", text)
            self.assertIn("npm ci", text)

    def test_frontend_launchers_sync_dependencies_before_starting(self) -> None:
        for path, function_name in (
            (START_PS1, "Sync-FrontendDependencies"),
            (DEV_PS1, "Sync-FrontendDependencies"),
            (START_FRONTEND_PS1, "Sync-FrontendDependencies"),
            (START_SH, "sync_frontend_dependencies"),
            (DEV_SH, "sync_frontend_dependencies"),
        ):
            self.assertIn(function_name, _read(path))

    def test_setup_scripts_fall_back_to_npm_install_without_a_lockfile(self) -> None:
        # npm ci refuses to run without a lockfile.
        for path in (SETUP_PS1, SETUP_SH):
            text = _read(path)
            self.assertIn("package-lock.json", text)
            self.assertIn("npm install", text)

    def test_only_the_setup_fallback_may_run_npm_install(self) -> None:
        # Every launcher and the hook installer name npm ci.
        for path in (DEV_COMMON, DEV_COMMON_SH, INSTALL_HOOKS_PS1, INSTALL_HOOKS_SH):
            self.assertNotIn("npm install", _read(path))
            self.assertIn("npm ci", _read(path))

    def test_dependency_drift_no_longer_duplicates_the_frontend_sync(self) -> None:
        # The sync runs first in every launcher, so a frontend arm could only report what it fixed.
        for path in (DEV_COMMON, DEV_COMMON_SH):
            self.assertNotIn(
                "package-lock.json is newer than the installed node_modules", _read(path)
            )


class SetupTaggingTests(unittest.TestCase):
    def test_both_setups_prepare_tagging_after_the_core_dependencies(self) -> None:
        for path in (SETUP_PS1, SETUP_SH):
            with self.subTest(path=path.name):
                text = _read(path)
                self.assertLess(text.index("check_ffmpeg.py"), text.index("setup_tagging.py"))
                self.assertLess(text.index("setup_tagging.py"), text.index("generate_types.py"))

    def test_tagging_can_be_skipped(self) -> None:
        self.assertIn("[switch]$SkipTagging", _read(SETUP_PS1))
        self.assertIn("--skip-tagging) SKIP_TAGGING=1", _read(SETUP_SH))

    def test_a_tagging_failure_warns_instead_of_failing_setup(self) -> None:
        ps1 = _read(SETUP_PS1)
        block = ps1[
            ps1.index("setup_tagging.py") : ps1.index("Set-Content", ps1.index("setup_tagging.py"))
        ]
        self.assertNotIn("throw", block)
        self.assertIn("-WarnOnly", block)
        sh = _read(SETUP_SH)
        block = sh[
            sh.index("setup_tagging.py") : sh.index("DEV_DEPS_STAMP", sh.index("setup_tagging.py"))
        ]
        self.assertNotIn("fail", block)
        self.assertIn("console_done warn", block)

    def test_dependency_drift_watches_the_tagging_requirements(self) -> None:
        for path in (DEV_COMMON, DEV_COMMON_SH):
            self.assertIn("requirements-tagging.txt", _read(path))


class SharedConsoleTests(unittest.TestCase):
    def test_every_script_prints_through_the_shared_console(self) -> None:
        for path in POWERSHELL_SCRIPTS:
            with self.subTest(path=path.name):
                text = _read(path)
                self.assertTrue(
                    "console.ps1" in text or "dev-common.ps1" in text,
                    msg=f"{path.name} must dot-source scripts/console.ps1",
                )
                self.assertNotIn("[ERROR]", text)
                self.assertNotIn("[WARN]", text)
                self.assertNotIn("-ForegroundColor", text)
        for path in BASH_SCRIPTS:
            with self.subTest(path=path.name):
                text = _read(path)
                self.assertTrue("console.sh" in text or "dev-common.sh" in text)
                self.assertNotIn("[ERROR]", text)
                self.assertNotIn("[WARN]", text)

    def test_the_powershell_console_stays_ascii(self) -> None:
        # Windows PowerShell 5.1 reads a BOM-less script as ANSI, so glyphs are built at runtime.
        for path in (CONSOLE_PS1, DEV_COMMON):
            with self.subTest(path=path.name):
                path.read_bytes().decode("ascii")

    def test_the_twins_offer_the_same_vocabulary(self) -> None:
        powershell = _read(CONSOLE_PS1)
        bash = _read(CONSOLE_SH)
        for ps_name, sh_name in (
            ("Write-ConsoleTitle", "console_title"),
            ("Write-ConsoleStep", "console_step"),
            ("Start-ConsoleStep", "console_start"),
            ("Update-ConsoleStep", "console_update"),
            ("Complete-ConsoleStep", "console_done"),
            ("Add-ConsoleNote", "console_note"),
            ("Write-ConsoleOutput", "console_output"),
            ("Write-ConsoleWarning", "console_warning"),
            ("Write-ConsoleResult", "console_result"),
            ("Invoke-ConsoleCommand", "console_run"),
            ("Invoke-ConsoleStep", "console_run_step"),
        ):
            with self.subTest(name=ps_name):
                self.assertIn(f"function {ps_name} ", powershell)
                self.assertIn(f"\n{sh_name}() {{", bash)


@unittest.skipIf(os.name == "nt" or shutil.which("bash") is None, "needs a Unix bash")
class ConsoleShBehaviourTests(unittest.TestCase):
    def _run(self, script: str) -> str:
        completed = subprocess.run(
            ["bash", "-c", f'. "{CONSOLE_SH}"\n{script}'],
            capture_output=True,
            text=True,
            check=False,
            env={**os.environ, "LANG": "C.UTF-8", "NO_COLOR": "1"},
        )
        return completed.stdout + completed.stderr

    def test_a_passing_step_hides_the_output_of_its_command(self) -> None:
        output = self._run(
            'console_run_step "Packages" "failed" sh -c "echo noisy log line"\n'
            'console_done ok "3 packages"'
        )
        self.assertRegex(output, r"✓ Packages +(\d+s +)?3 packages")
        self.assertNotIn("noisy log line", output)

    def test_a_failing_step_shows_its_command_and_output(self) -> None:
        output = self._run(
            'console_run_step "Packages" "Install failed." sh -c "echo the real error; exit 3" '
            '|| console_result fail "$CONSOLE_FAILURE"'
        )
        self.assertRegex(output, r"✗ Packages +(\d+s +)?exit 3")
        self.assertIn("$ sh -c echo the real error; exit 3  (exit 3)", output)
        self.assertIn("the real error", output)
        self.assertTrue(output.rstrip().endswith("Install failed."))

    def test_a_long_failure_keeps_its_end_and_points_at_the_full_log(self) -> None:
        output = self._run('console_run_step "Build" "failed" sh -c "seq 1 100; exit 1" || true')
        self.assertIn("40 earlier lines in", output)
        self.assertNotIn("\n40\n", output)
        self.assertIn("\n41\n", output)
        self.assertIn("\n100\n", output)


@unittest.skipIf(os.name == "nt" or shutil.which("bash") is None, "needs a Unix bash")
class DevCommonShBehaviourTests(unittest.TestCase):
    def test_only_processes_naming_this_folder_count_as_ours(self) -> None:
        script = (
            f'. "{DEV_COMMON_SH}"\n'
            # A second command keeps sh from exec-ing sleep, which would drop the path.
            'sh -c "sleep 30; :" "$DEV_ROOT/scripts/dev_server.py" & ours=$!\n'
            "sleep 30 & other=$!\n"
            "sleep 0.2\n"
            'process_is_ours "$ours" && echo ours-yes\n'
            'process_is_ours "$other" || echo other-no\n'
            'kill "$ours" "$other"\n'
        )
        completed = subprocess.run(
            ["bash", "-c", script], capture_output=True, text=True, check=False
        )
        self.assertIn("ours-yes", completed.stdout)
        self.assertIn("other-no", completed.stdout)


if __name__ == "__main__":
    unittest.main()
