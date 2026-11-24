<#
.SYNOPSIS
  Launches the DataForge backend and frontend dev servers in two separate console
  windows, waits until each is actually serving, then supervises them.

.DESCRIPTION
  Separate windows keep uvicorn's reload output apart from Vite's. Press any key in this
  window, or close it, to stop both servers, uvicorn's reload child included.
  Double-click dev.bat for the same. For production, use start.ps1.

.PARAMETER BackendOnly
  Start only the API (port from DATAFORGE_API_PORT, default 18080).

.PARAMETER FrontendOnly
  Start only the Vite dev server (port from DATAFORGE_UI_PORT, default 18081).

.PARAMETER NoBrowser
  Do not open the browser once the servers are ready.

.PARAMETER NoReload
  Run the API without uvicorn's reloader. Use this while a long job is running:
  a reload re-runs job recovery and re-spawns worker threads mid-flight.

.PARAMETER Detach
  Exit as soon as both servers are ready instead of supervising them. Stop them
  later with stop.bat.

.EXAMPLE
  .\dev.ps1 -NoReload

.EXAMPLE
  .\dev.ps1 -BackendOnly -NoBrowser
#>

[CmdletBinding()]
param(
    [switch]$BackendOnly,
    [switch]$FrontendOnly,
    [switch]$NoBrowser,
    [switch]$NoReload,
    [switch]$Detach
)

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'scripts\dev-common.ps1')

function Stop-DevServers {
    param(
        [System.Diagnostics.Process]$Backend,
        [System.Diagnostics.Process]$Frontend
    )

    Write-ConsoleBlank
    Start-ConsoleStep 'Stopping'
    foreach ($proc in @($Backend, $Frontend)) {
        if ($proc -and -not $proc.HasExited) {
            Stop-DevTree -ProcessId $proc.Id
        }
    }

    # Backstop for a console closed by hand.
    $freed = $true
    if ($Backend) { $freed = (Clear-DevPort -Port $DevApiPort -Quiet) -and $freed }
    if ($Frontend) { $freed = (Clear-DevPort -Port $DevUiPort -Quiet) -and $freed }
    if ($freed) {
        Complete-ConsoleStep -Detail 'both servers stopped'
    } else {
        Complete-ConsoleStep -Status fail -Detail 'a port is still in use; stop.bat retries'
    }
}

if ($BackendOnly -and $FrontendOnly) {
    Exit-Launcher '-BackendOnly and -FrontendOnly cannot be combined.'
}

$startBackend = -not $FrontendOnly
$startFrontend = -not $BackendOnly
$paths = Get-DevPaths
$reloadNote = if ($NoReload) { 'no reload (-NoReload)' } else { 'uvicorn reloader' }

$titleLines = @()
if ($startBackend) { $titleLines += 'API  {0}  {1}' -f $DevApiUrl, $reloadNote }
if ($startFrontend) { $titleLines += 'UI   {0}  Vite HMR' -f $DevUiUrl }
Write-ConsoleTitle 'DataForge development' $titleLines

# Regenerating keeps the gitignored sources in step across branch switches.
if ($startFrontend) { Update-DevGeneratedSources | Out-Null }

if (-not (Test-DevPrerequisites -SkipBackend:(-not $startBackend) -SkipFrontend:(-not $startFrontend))) {
    Exit-Launcher
}
if ($startFrontend -and -not (Sync-FrontendDependencies)) { Exit-Launcher }
if ($startBackend) { Test-BackendDependencyDrift | Out-Null }

# Vite's strictPort makes a leftover node.exe on the UI port fatal.
if ($startBackend -and -not (Clear-DevPort -Port $DevApiPort)) { Exit-Launcher 'The API port is taken.' }
if ($startFrontend -and -not (Clear-DevPort -Port $DevUiPort)) { Exit-Launcher 'The UI port is taken.' }

$backendProc = $null
$frontendProc = $null
$leaveRunning = $false

try {
    if ($startBackend) {
        $backendCommand = "`"$($paths.VenvPy)`" `"$($paths.DevServer)`""
        if ($NoReload) { $backendCommand += ' --no-reload' }
        $backendProc = Start-DevConsole `
            -Title 'DataForge - Backend' `
            -WorkingDirectory $paths.Root `
            -Banner @("DataForge API - $DevApiUrl", "Hot reload: $reloadNote") `
            -Command $backendCommand
        # Armed before the readiness wait, the likeliest time for a close to orphan a server.
        Register-DevExitGuard -ProcessId @($backendProc.Id)
    }

    if ($startFrontend) {
        $frontendProc = Start-DevConsole `
            -Title 'DataForge - Frontend' `
            -WorkingDirectory $paths.Frontend `
            -Banner @("DataForge UI - $DevUiUrl", 'Hot reload: Vite HMR') `
            -Command "call `"$(Get-NpmCommand)`" run dev"
        Register-DevExitGuard -ProcessId @(@($backendProc, $frontendProc) | Where-Object { $_ } | ForEach-Object { $_.Id })
    }

    # Wait for real readiness, not a fixed sleep.
    $failed = @()
    if ($startBackend) {
        Start-ConsoleStep 'API'
        if (Wait-HttpReady -Url $DevHealthUrl -TimeoutSec 60 -Process $backendProc) {
            Complete-ConsoleStep -Detail ('ready on port {0}' -f $DevApiPort)
        } else {
            Complete-ConsoleStep -Status fail -Detail 'never answered /api/health'
            $failed += 'Check the "DataForge - Backend" window for the error.'
        }
    }

    if ($startFrontend) {
        Start-ConsoleStep 'UI'
        if (Wait-TcpReady -Port $DevUiPort -TimeoutSec 90 -Process $frontendProc) {
            Complete-ConsoleStep -Detail ('ready on port {0}' -f $DevUiPort)
        } else {
            Complete-ConsoleStep -Status fail -Detail ('never accepted connections on port {0}' -f $DevUiPort)
            $failed += 'Check the "DataForge - Frontend" window for the error.'
        }
    }

    if ($failed.Count -gt 0) {
        $leaveRunning = $true
        Unregister-DevExitGuard
        Exit-Launcher 'The dev servers did not start.' ($failed + 'The server windows stay open so the error stays readable.')
    }

    $url = if ($startFrontend) { $DevUiUrl } else { $DevApiUrl }
    if (-not $NoBrowser) {
        try { Start-Process $url | Out-Null } catch { }
    }

    if ($Detach) {
        $leaveRunning = $true
        Unregister-DevExitGuard
        Write-ConsoleResult "Running at $url." -Lines @('The servers keep running in their own windows; stop.bat stops them.')
        exit 0
    }

    Write-ConsoleResult "Running at $url."
    Wait-ConsoleKey 'Press any key here to stop the servers, or close this window.'
} finally {
    if (-not $leaveRunning) {
        Stop-DevServers -Backend $backendProc -Frontend $frontendProc
    }
}

exit 0
