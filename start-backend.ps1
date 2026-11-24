# Starts only the backend API server in this terminal; for both, use dev.bat / dev.ps1.

[CmdletBinding()]
param(
    # No reloader, so a reload never re-spawns job workers mid-flight.
    [switch]$NoReload
)

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'scripts\dev-common.ps1')

$paths = Get-DevPaths
Set-Location $paths.Root
$reloadNote = if ($NoReload) { 'no reload (-NoReload)' } else { 'uvicorn reloader' }

Write-ConsoleTitle 'DataForge - Backend' @(('API  {0}  {1}' -f $DevApiUrl, $reloadNote))

if (-not (Test-DevPrerequisites -SkipFrontend)) { Exit-Launcher }
Test-BackendDependencyDrift | Out-Null

if (-not (Clear-DevPort -Port $DevApiPort)) { Exit-Launcher 'The API port is taken.' }

$serverArgs = @($paths.DevServer)
if ($NoReload) { $serverArgs += '--no-reload' }

Write-ConsoleResult "Starting the API at $DevApiUrl." -Lines @('Its log follows; Ctrl+C stops it.')
Write-Host ''
& $paths.VenvPy $serverArgs
