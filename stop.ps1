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

Write-ConsoleTitle 'DataForge stop'

# The UI port serves Vite under dev.ps1 and the whole app under start.ps1.
$apiFreed = Clear-DevPort -Port $DevApiPort -ReportFree
$uiFreed = Clear-DevPort -Port $DevUiPort -ReportFree

if ($apiFreed -and $uiFreed) {
    Write-ConsoleResult 'DataForge is stopped.'
    exit 0
}

Write-ConsoleResult -Status fail 'Some ports are still in use.'
exit 1
