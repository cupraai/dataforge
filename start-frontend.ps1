# Starts only the Vite dev server in this terminal; for both, use dev.bat / dev.ps1.

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'scripts\dev-common.ps1')

$paths = Get-DevPaths
Set-Location $paths.Frontend

Write-ConsoleTitle 'DataForge - Frontend' @(('UI   {0}  Vite HMR' -f $DevUiUrl))

if (-not (Test-DevPrerequisites -SkipBackend)) { Exit-Launcher }
if (-not (Sync-FrontendDependencies)) { Exit-Launcher }

# Vite's strictPort makes a leftover node.exe fatal.
if (-not (Clear-DevPort -Port $DevUiPort)) { Exit-Launcher 'The UI port is taken.' }

Write-ConsoleResult "Starting the UI at $DevUiUrl." -Lines @('Its log follows; Ctrl+C stops it.')
Write-Host ''
& (Get-NpmCommand) run dev
