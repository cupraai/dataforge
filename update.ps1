<#
.SYNOPSIS
  Updates a Git clone of DataForge to the latest version of its branch.

.DESCRIPTION
  Needs Git and a clone. A fast-forward pull, so conflicting local changes stop it
  untouched. Setup reruns only when runtimes or backend dependencies changed.
  Stop the app first. Double-click update.bat for the same.

.EXAMPLE
  .\update.ps1
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'scripts\dev-common.ps1')

$Root = $PSScriptRoot
$VenvPy = Join-Path $Root 'backend\.venv\Scripts\python.exe'
# Changes to these are what setup.ps1 acts on and the launchers do not.
$SetupInputs = @(
    '.python-version',
    '.node-version',
    'setup.ps1',
    'backend/requirements.txt',
    'backend/requirements-dev.txt',
    'backend/requirements-tagging.txt',
    'scripts/setup_tagging.py'
)

# Commits listed under the pull step before the rest are summarised.
$ShownCommits = 10

function Get-RunningServer {
    foreach ($port in @($DevApiPort, $DevUiPort)) {
        foreach ($proc in @(Get-DevPortListener -Port $port)) {
            if (Test-DevOwnedProcess $proc) {
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

Write-ConsoleTitle 'DataForge update'

$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git) {
    Exit-Launcher 'Git is required to update DataForge, and it is not on PATH.' @(
        'Install it from https://git-scm.com/downloads/win, then run update.bat again.'
    )
}

# A file, not a folder, in a linked worktree.
if (-not (Test-Path -LiteralPath (Join-Path $Root '.git'))) {
    Exit-Launcher 'This folder is not a Git clone, so there is nothing to pull.' @(
        'A ZIP download is updated by extracting a new copy; see "Stop, restart, and update"',
        'in docs\getting-started.md. To update with update.bat from now on, clone with Git.'
    )
}

$running = Get-RunningServer
if ($running) {
    Exit-Launcher ('DataForge is still running ({0}, PID {1}, on port {2}).' -f $running.Name, $running.Id, $running.Port) @(
        'Stop it first: press a key in its launcher window, or run stop.bat.'
    )
}

try {
    $before = Get-GitHead

    # A credential prompt would hang unseen behind the captured output.
    $env:GIT_TERMINAL_PROMPT = '0'
    Start-ConsoleStep 'Pull'
    $pull = Invoke-ConsoleCommand -FilePath $git.Source -ArgumentList @('-C', $Root, 'pull', '--ff-only')
    if ($pull.ExitCode -ne 0) {
        Complete-ConsoleStep -Status fail -Detail ('exit {0}' -f $pull.ExitCode)
        Write-ConsoleOutput -Command 'git pull --ff-only' -ExitCode $pull.ExitCode -Text $pull.Output
        Exit-Launcher 'Git could not update this folder; nothing was changed.' @(
            'Local commits or edits to project files can block the update.'
        )
    }

    $after = Get-GitHead
    if ($after -eq $before) {
        Complete-ConsoleStep -Detail 'already up to date'
        Write-ConsoleResult 'DataForge is already up to date.'
        exit 0
    }

    $commits = @(& git -C $Root log --format='%h %s' --no-decorate "$before..$after")
    Complete-ConsoleStep -Detail ('{0}, {1} -> {2}' -f (Format-ConsoleCount $commits.Count 'new commit'),
        $before.Substring(0, 7), $after.Substring(0, 7))
    foreach ($commit in ($commits | Select-Object -First $ShownCommits)) { Write-ConsoleNote $commit }
    if ($commits.Count -gt $ShownCommits) {
        Write-ConsoleNote ('{0} and {1} more' -f $ConsoleGlyphs.more, ($commits.Count - $ShownCommits))
    }

    $setupChanges = @(& git -C $Root diff --name-only $before $after -- $SetupInputs)
    if ($LASTEXITCODE -ne 0) { throw 'Could not list the files the update changed.' }

    $haveVenv = Test-Path -LiteralPath $VenvPy -PathType Leaf
    if ($haveVenv -and $setupChanges.Count -eq 0) {
        Write-ConsoleStep -Label 'Setup' -Status skip -Detail 'not needed: no runtime or backend dependency changes'
    } else {
        $setupArgs = @{}
        if ($haveVenv -and -not (Test-TaggingInstalled)) {
            # Kept as the user left it: setup.bat adds the tagger on request.
            $setupArgs['SkipTagging'] = $true
        }
        $reason = if ($haveVenv) { ($setupChanges -join ', ') + ' changed' } else { 'no backend venv yet' }
        Write-ConsoleStep -Label 'Setup' -Detail "runs below: $reason"
        if ($setupArgs['SkipTagging']) {
            Write-ConsoleNote 'The optional tagger stays left out, as before; setup.bat adds it.'
        }
        Write-ConsoleBlank
        & (Join-Path $Root 'setup.ps1') @setupArgs
        if ($LASTEXITCODE -ne 0) {
            Exit-Launcher 'The code was updated, but setup failed.' @(
                'Fix the reported problem and run setup.bat before starting DataForge.'
            )
        }
        exit 0
    }
} catch {
    Exit-Launcher $_.Exception.Message
}

Write-ConsoleResult 'Update complete.' -Lines @(
    'Run start.bat to launch the app; it rebuilds the UI if that changed.'
)
exit 0
