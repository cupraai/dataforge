<#
.SYNOPSIS
  Stops DataForge by freeing the configured ports. Covers both launchers.

.DESCRIPTION
  For a server left holding its port: after -Detach, or after closing a server console.
  Only leftover python/node processes are stopped; anything else is left alone.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'scripts\dev-common.ps1')

$Host.UI.RawUI.WindowTitle = 'DataForge - Stop'

Write-Host 'Stopping DataForge servers...'

# 18081 serves Vite under dev.ps1 and the whole app under start.ps1.
$apiFreed = Clear-DevPort -Port $DevApiPort -Label 'DataForge'
$uiFreed = Clear-DevPort -Port $DevUiPort -Label 'DataForge'

if ($apiFreed -and $uiFreed) {
    Write-Host ('Ports {0} and {1} are free.' -f $DevApiPort, $DevUiPort) -ForegroundColor Green
    exit 0
}

exit 1
