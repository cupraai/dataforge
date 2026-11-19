# Starts only the Vite dev server in this terminal; for both, use dev.bat / dev.ps1.

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'scripts\dev-common.ps1')

$Host.UI.RawUI.WindowTitle = 'DataForge - Frontend'

$paths = Get-DevPaths
Set-Location $paths.Frontend

if (-not (Test-DevPrerequisites -SkipBackend)) {
    Read-Host 'Press Enter to exit' | Out-Null
    exit 1
}
if (-not (Sync-FrontendDependencies)) {
    Read-Host 'Press Enter to exit' | Out-Null
    exit 1
}

# Vite's strictPort makes a leftover node.exe fatal.
if (-not (Clear-DevPort -Port $DevUiPort -Label 'frontend')) {
    Read-Host 'Press Enter to exit' | Out-Null
    exit 1
}

Write-Host ('Starting frontend on {0} ...' -f $DevUiUrl)
& (Get-NpmCommand) run dev
