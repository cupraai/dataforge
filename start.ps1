<#
.SYNOPSIS
  Runs DataForge in production mode: builds the frontend if needed, then serves the
  bundled UI and the API from a single process.

.DESCRIPTION
  One uvicorn process serves the built UI at / and the API under /api: no proxy, no CORS,
  and no reloader to restart a long job. The build is skipped while frontend\dist is
  fresh. Press any key in this window, or close it, to stop the server.
  Double-click start.bat for the same. For hot reload, use dev.ps1.

.PARAMETER Rebuild
  Build the frontend even when dist looks up to date.

.PARAMETER NoBuild
  Never build. Serves whatever is already in frontend\dist.

.PARAMETER NoBrowser
  Do not open the browser once the server is ready.

.PARAMETER Detach
  Exit as soon as the server is ready instead of supervising it. Stop it later with
  stop.bat.

.EXAMPLE
  .\start.ps1

.EXAMPLE
  .\start.ps1 -Rebuild -NoBrowser
#>

[CmdletBinding()]
param(
    [switch]$Rebuild,
    [switch]$NoBuild,
    [switch]$NoBrowser,
    [switch]$Detach
)

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'scripts\dev-common.ps1')

if ($Rebuild -and $NoBuild) {
    Exit-Launcher '-Rebuild and -NoBuild cannot be combined.'
}

$paths = Get-DevPaths

Write-ConsoleTitle 'DataForge' @(('{0}  production build, no hot reload' -f $DevUiUrl))

# Regenerated first, so a branch switch cannot leave a falsely fresh dist.
Update-DevGeneratedSources | Out-Null

if (-not (Test-DevPrerequisites)) { Exit-Launcher }
if (-not (Sync-FrontendDependencies)) { Exit-Launcher }
Test-BackendDependencyDrift | Out-Null

if ($NoBuild) {
    if (-not (Test-Path -LiteralPath (Join-Path $paths.Dist 'index.html') -PathType Leaf)) {
        Write-ConsoleStep -Label 'Frontend build' -Status fail -Detail 'frontend\dist is empty'
        Exit-Launcher 'There is no frontend build to serve.' @('Run start.bat without -NoBuild.')
    }
    Write-ConsoleStep -Label 'Frontend build' -Status skip -Detail 'serving the existing frontend\dist (-NoBuild)'
} elseif ($Rebuild) {
    if (-not (Invoke-FrontendBuild -Reason 'rebuilt (-Rebuild)')) { Exit-Launcher }
} elseif (-not (Test-DistFresh)) {
    if (-not (Invoke-FrontendBuild)) { Exit-Launcher }
} else {
    Write-ConsoleStep -Label 'Frontend build' -Detail 'up to date'
}

# A leftover dev window's Vite holds this port too.
if (-not (Clear-DevPort -Port $DevUiPort)) { Exit-Launcher 'The app port is taken.' }

$appProc = $null
$leaveRunning = $false

try {
    $appProc = Start-DevConsole `
        -Title 'DataForge - Server' `
        -WorkingDirectory $paths.Root `
        -Banner @("DataForge - $DevUiUrl", 'Production: bundled UI, no hot reload') `
        -Command "`"$($paths.VenvPy)`" `"$($paths.ProdServer)`""
    # Armed before the readiness wait, the likeliest time for a close to orphan a server.
    Register-DevExitGuard -ProcessId @($appProc.Id)

    Start-ConsoleStep 'Server'
    if (Wait-HttpReady -Url $DevAppHealthUrl -TimeoutSec 60 -Process $appProc) {
        Complete-ConsoleStep -Detail ('ready on port {0}' -f $DevUiPort)
    } else {
        Complete-ConsoleStep -Status fail -Detail 'never answered /api/health'
        $leaveRunning = $true
        Unregister-DevExitGuard
        Exit-Launcher 'DataForge did not start.' @(
            'Check the "DataForge - Server" window for the error; it stays open.'
        )
    }

    if (-not $NoBrowser) {
        try { Start-Process $DevUiUrl | Out-Null } catch { }
    }

    if ($Detach) {
        $leaveRunning = $true
        Unregister-DevExitGuard
        Write-ConsoleResult "Running at $DevUiUrl." -Lines @('The server keeps running in its own window; stop.bat stops it.')
        exit 0
    }

    Write-ConsoleResult "Running at $DevUiUrl."
    Wait-ConsoleKey 'Press any key here to stop the server, or close this window.'
} finally {
    if (-not $leaveRunning) {
        Write-ConsoleBlank
        Start-ConsoleStep 'Stopping'
        if ($appProc -and -not $appProc.HasExited) { Stop-DevTree -ProcessId $appProc.Id }
        # Backstop for a console closed by hand.
        if (Clear-DevPort -Port $DevUiPort -Quiet) {
            Complete-ConsoleStep -Detail 'server stopped'
        } else {
            Complete-ConsoleStep -Status fail -Detail 'the port is still in use; stop.bat retries'
        }
    }
}

exit 0
