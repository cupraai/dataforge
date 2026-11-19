# Starts only the backend API server in this terminal; for both, use dev.bat / dev.ps1.

[CmdletBinding()]
param(
    # No reloader, so a reload never re-spawns job workers mid-flight.
    [switch]$NoReload
)

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'scripts\dev-common.ps1')

$Host.UI.RawUI.WindowTitle = 'DataForge - Backend'

$paths = Get-DevPaths
Set-Location $paths.Root

if (-not (Test-DevPrerequisites -SkipFrontend)) {
    Read-Host 'Press Enter to exit' | Out-Null
    exit 1
}
Test-BackendDependencyDrift | Out-Null

if (-not (Clear-DevPort -Port $DevApiPort -Label 'backend')) {
    Read-Host 'Press Enter to exit' | Out-Null
    exit 1
}

$serverArgs = @($paths.DevServer)
if ($NoReload) { $serverArgs += '--no-reload' }

Write-Host ('Starting backend on {0} ...' -f $DevApiUrl)
& $paths.VenvPy $serverArgs
