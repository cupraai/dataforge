<#
.SYNOPSIS
  Updates a Git clone of DataForge to the latest version of its branch.

.DESCRIPTION
  Needs Git on PATH; a ZIP download has no history to pull, so it is updated by extracting
  a new copy instead. The update is a fast-forward pull, so local commits or edits that
  conflict with it stop the update without changing anything.

  Setup runs again only when the update changed a runtime version or the backend
  dependencies. The optional tagger is reinstalled only when it is already installed.
  Frontend dependencies and the UI build need nothing here: the next start syncs and
  rebuilds them.

  The app must be stopped first, since the pull and setup replace files it is using.

  Use this directly, or double-click update.bat for the same behavior.

.EXAMPLE
  .\update.ps1
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'scripts\dev-common.ps1')

$Host.UI.RawUI.WindowTitle = 'DataForge Update'

$Root = $PSScriptRoot
$VenvPy = Join-Path $Root 'backend\.venv\Scripts\python.exe'
# Changes to these are what setup.ps1 acts on and the launchers do not.
$SetupInputs = @(
    '.python-version',
    'setup.ps1',
    'backend/requirements.txt',
    'backend/requirements-dev.txt',
    'backend/requirements-tagging.txt',
    'scripts/setup_tagging.py'
)

function Exit-Update {
    param([int]$Code = 1)
    Write-Host ''
    exit $Code
}

function Write-UpdateError {
    param([Parameter(Mandatory = $true)][string[]]$Lines)
    Write-Host ('[ERROR] {0}' -f $Lines[0]) -ForegroundColor Red
    foreach ($line in ($Lines | Select-Object -Skip 1)) { Write-Host ('        {0}' -f $line) }
}

function Get-RunningServer {
    $ours = @('python', 'pythonw', 'node')
    foreach ($port in @($DevApiPort, $DevUiPort)) {
        foreach ($proc in @(Get-DevPortListener -Port $port)) {
            if ($ours -contains $proc.ProcessName) {
                return [pscustomobject]@{ Port = $port; Name = $proc.ProcessName; Id = $proc.Id }
            }
        }
    }
    return $null
}

function Get-GitHead {
    $head = (& git -C $Root rev-parse HEAD | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $head) { throw 'Could not read the current Git commit.' }
    return $head
}

function Test-TaggingInstalled {
    # Single quotes in the Python: Windows PowerShell drops double quotes from native arguments.
    & $VenvPy -c 'import importlib.util, sys; sys.exit(importlib.util.find_spec(''torch'') is None)'
    return $LASTEXITCODE -eq 0
}

Write-Host '================================================'
Write-Host '  Updating DataForge'
Write-Host '================================================'
Write-Host ''

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-UpdateError @(
        'Git is required to update DataForge, and it is not on PATH.',
        'Install it from https://git-scm.com/downloads/win, then run update.bat again.'
    )
    Exit-Update
}

# A file, not a folder, in a linked worktree.
if (-not (Test-Path -LiteralPath (Join-Path $Root '.git'))) {
    Write-UpdateError @(
        'This folder is not a Git clone, so there is nothing to pull.',
        'A ZIP download is updated by extracting a new copy; see "Stop, restart, and update"',
        'in docs\getting-started.md. To update with update.bat from now on, clone the',
        'repository with Git instead.'
    )
    Exit-Update
}

$running = Get-RunningServer
if ($running) {
    Write-UpdateError @(
        ('DataForge is still running ({0}, PID {1}, on port {2}).' -f $running.Name, $running.Id, $running.Port),
        'Stop it first: press a key in its launcher window, or run stop.bat.'
    )
    Exit-Update
}

try {
    $before = Get-GitHead

    Write-Host 'Pulling the latest version...'
    & git -C $Root pull --ff-only | Out-Host
    if ($LASTEXITCODE -ne 0) {
        Write-Host ''
        Write-UpdateError @(
            'Git could not update this folder; its message is above.',
            'Local commits or edits to project files can block the update. Nothing was changed.'
        )
        Exit-Update
    }

    $after = Get-GitHead
    if ($after -eq $before) {
        Write-Host ''
        Write-Host 'DataForge is already up to date.' -ForegroundColor Green
        exit 0
    }

    Write-Host ''
    Write-Host 'Changes in this update:'
    & git -C $Root log --oneline --no-decorate "$before..$after" | Out-Host

    $setupChanges = @(& git -C $Root diff --name-only $before $after -- $SetupInputs)
    if ($LASTEXITCODE -ne 0) { throw 'Could not list the files the update changed.' }

    $haveVenv = Test-Path -LiteralPath $VenvPy -PathType Leaf
    if ($haveVenv -and $setupChanges.Count -eq 0) {
        Write-Host 'No runtime or backend dependency changes, so setup is not needed.'
    } else {
        $setupArgs = @{}
        if ($haveVenv -and -not (Test-TaggingInstalled)) {
            Write-Host 'Leaving out the optional tagger, as it is not installed. Run setup.bat to add it.'
            $setupArgs['SkipTagging'] = $true
        }
        Write-Host ''
        Write-Host 'Running setup...'
        Write-Host ''
        & (Join-Path $Root 'setup.ps1') @setupArgs
        if ($LASTEXITCODE -ne 0) {
            Write-UpdateError @(
                'The code was updated, but setup failed; its message is above.',
                'Fix the reported problem and run setup.bat before starting DataForge.'
            )
            Exit-Update
        }
    }
} catch {
    Write-Host ''
    Write-UpdateError @($_.Exception.Message)
    Exit-Update
}

Write-Host ''
Write-Host '================================================'
Write-Host '  Update complete.'
Write-Host '  Run start.bat to launch the app; it rebuilds the UI if that changed.'
Write-Host '================================================'
exit 0
