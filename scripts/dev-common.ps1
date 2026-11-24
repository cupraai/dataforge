# Shared helpers for the PowerShell launchers; dot-source it.
# Keep this file ASCII-only: Windows PowerShell 5.1 reads BOM-less scripts as ANSI.
# Mirrors scripts/dev-common.sh except for process supervision; change both together.

. (Join-Path $PSScriptRoot 'console.ps1')

function Get-DevEnvMap {
    <#
    .SYNOPSIS
      KEY=VALUE pairs from the project .env, mirroring backend/env_file.py.

    .DESCRIPTION
      Same order as env_file.py, first file wins; real environment variables override.
      The root comes from this file's location: nothing below is defined yet.
    #>
    $root = Split-Path -Parent $PSScriptRoot
    $map = @{}

    foreach ($candidate in @((Join-Path $root '.env'), (Join-Path $root 'backend\.env'))) {
        if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }

        # An unreadable .env degrades to defaults instead of killing the launcher.
        foreach ($line in (Get-Content -LiteralPath $candidate -ErrorAction SilentlyContinue)) {
            $text = $line.Trim()
            if ($text.Length -eq 0 -or $text.StartsWith('#')) { continue }
            if ($text.StartsWith('export ')) { $text = $text.Substring(7).Trim() }

            # .NET Framework has no String.Split(char, int) overload.
            $parts = $text -split '=', 2
            if ($parts.Count -ne 2) { continue }

            $key = $parts[0].Trim()
            if ($key.Length -eq 0) { continue }

            $value = $parts[1].Trim()
            if ($value.Length -ge 2) {
                $quote = [string]$value[0]
                if (($quote -eq '"' -or $quote -eq "'") -and ([string]$value[$value.Length - 1] -eq $quote)) {
                    $value = $value.Substring(1, $value.Length - 2)
                }
            }
            $map[$key] = $value
        }
        break
    }

    return $map
}

function Get-DevPort {
    <#
    .SYNOPSIS
      A port setting, with a real environment variable winning over the .env file.
    #>
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][hashtable]$EnvMap,
        [Parameter(Mandatory = $true)][int]$Default
    )

    # An explicitly blank OS var still wins, as in dev_server.py.
    $raw = [System.Environment]::GetEnvironmentVariable($Name)
    if ($null -eq $raw -and $EnvMap.ContainsKey($Name)) { $raw = $EnvMap[$Name] }
    if ([string]::IsNullOrWhiteSpace($raw)) { return $Default }

    $port = 0
    if (-not [int]::TryParse($raw.Trim(), [ref]$port) -or $port -lt 1 -or $port -gt 65535) {
        Write-ConsoleWarning ('Ignoring {0}={1}: not a port number. Using {2}.' -f $Name, $raw, $Default)
        return $Default
    }
    return $port
}

# Read once on dot-source, into the caller's scope; vite and the backend read the same .env.
$DevEnvMap = Get-DevEnvMap
$DevApiPort = Get-DevPort -Name 'DATAFORGE_API_PORT' -EnvMap $DevEnvMap -Default 18080
$DevUiPort = Get-DevPort -Name 'DATAFORGE_UI_PORT' -EnvMap $DevEnvMap -Default 18081
$DevApiUrl = 'http://127.0.0.1:{0}' -f $DevApiPort
$DevUiUrl = 'http://127.0.0.1:{0}' -f $DevUiPort
$DevHealthUrl = '{0}/api/health' -f $DevApiUrl
# Production serves both halves on the UI port, so its health check lives there.
$DevAppHealthUrl = '{0}/api/health' -f $DevUiUrl

function Exit-Launcher {
    <#
    .SYNOPSIS
      Ends a launcher with exit code 1, after the reason when one is given.

    .DESCRIPTION
      Steps that already reported their failure call it bare. The .bat shims pause on a
      non-zero exit, keeping the error on screen.
    #>
    param([string]$Message = '', [string[]]$Lines = @())
    if ($Message) { Write-ConsoleFailure -Message $Message -Lines $Lines }
    Write-Host ''
    exit 1
}

function Get-DevPaths {
    <#
    .SYNOPSIS
      Project paths, derived from this file's location rather than the caller's
      working directory.
    #>
    $root = Split-Path -Parent $PSScriptRoot
    [pscustomobject]@{
        Root       = $root
        Backend    = Join-Path $root 'backend'
        Frontend   = Join-Path $root 'frontend'
        Scripts    = Join-Path $root 'scripts'
        Dist       = Join-Path $root 'frontend\dist'
        VenvPy     = Join-Path $root 'backend\.venv\Scripts\python.exe'
        DevServer  = Join-Path $root 'scripts\dev_server.py'
        ProdServer = Join-Path $root 'scripts\prod_server.py'
    }
}

function Get-NpmCommand {
    <#
    .SYNOPSIS
      The portable npm from setup.bat when present, otherwise whatever is on PATH.

    .DESCRIPTION
      Also puts .node on PATH so npm lifecycle scripts that spawn `node` by name
      find the portable copy. A fresh clone has no global Node.
    #>
    $nodeDir = Join-Path (Get-DevPaths).Root '.node'
    $local = Join-Path $nodeDir 'npm.cmd'
    if (Test-Path $local) {
        $currentPath = [string]$env:PATH
        if (-not $currentPath.StartsWith("$nodeDir;", [System.StringComparison]::OrdinalIgnoreCase)) {
            $env:PATH = "$nodeDir;$currentPath"
        }
        return $local
    }
    return 'npm.cmd'
}

# Generated and gitignored; the frontend neither starts nor builds without them.
$DevGeneratedSources = @('types.ts', 'constants.ts', 'wireGuards.ts')

function Update-DevGeneratedSources {
    <#
    .SYNOPSIS
      Regenerates frontend\src\shared\{types,constants,wireGuards}.ts from
      backend\schemas.py. Returns $false only when the generator ran and failed.

    .DESCRIPTION
      Always regenerates: gitignored files survive a branch switch with a plausible
      mtime. A missing or broken venv is reported by Test-DevPrerequisites instead.
    #>
    $paths = Get-DevPaths
    if (-not (Test-Path $paths.VenvPy) -or -not (Test-DevVenvWorks)) { return $true }

    # Only changed files are rewritten, so dist freshness is unaffected.
    $output = Invoke-ConsoleStep -Label 'API types' -FilePath $paths.VenvPy `
        -ArgumentList @((Join-Path $paths.Scripts 'generate_types.py')) `
        -Detail { param($text) Get-DevGeneratedDetail $text } `
        -WarnOnly 'left as they were; the UI may not match the API'
    return $null -ne $output
}

function Get-DevGeneratedDetail {
    param([string]$Output)
    $written = @([regex]::Matches($Output, '(?m)^Wrote ')).Count
    if ($written -eq 0) { return 'up to date' }
    return '{0} updated' -f (Format-ConsoleCount $written 'file')
}

function Get-DevNpmDetail {
    param([string]$Output)
    $added = [regex]::Match($Output, 'added (\d+) packages?')
    if ($added.Success) { return Format-ConsoleCount ([int]$added.Groups[1].Value) 'package' }
    return 'up to date'
}


function Get-DevRootPathProblem {
    <#
    .SYNOPSIS
      Why this folder's path cannot run DataForge on Windows, or an empty string.

    .DESCRIPTION
      npm's .cmd shims expand their own folder unquoted, so cmd.exe splits the path at an
      ampersand or a caret and every npm script fails. Spaces are fine.
    #>
    param([string]$Root = (Get-DevPaths).Root)
    $found = @([char[]]'&^' | Where-Object { $Root.IndexOf($_) -ge 0 })
    if ($found.Count -eq 0) { return '' }
    return ("The folder path contains {0}, which npm's Windows command scripts cannot handle. " +
        'Move DataForge to a folder without & or ^.') -f (($found | ForEach-Object { "'$_'" }) -join ' and ')
}

function Test-DevVenvWorks {
    # A moved folder keeps python.exe, but the venv still points at the old one and fails.
    $paths = Get-DevPaths
    try {
        & $paths.VenvPy -c 'pass' 2>$null | Out-Null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

function Test-DevPrerequisites {
    <#
    .SYNOPSIS
      Verifies the venv, node_modules, and generated frontend sources exist. Prints
      what to run and returns $false when something is missing.
    #>
    param(
        [switch]$SkipBackend,
        [switch]$SkipFrontend
    )

    $paths = Get-DevPaths
    $ok = $true

    $pathProblem = Get-DevRootPathProblem
    if ($pathProblem) {
        Write-ConsoleFailure $pathProblem
        return $false
    }

    if (-not $SkipBackend -and -not (Test-Path $paths.VenvPy)) {
        Write-ConsoleStep -Label 'Backend venv' -Status fail -Detail 'not found at backend\.venv'
        $ok = $false
    } elseif (-not $SkipBackend -and -not (Test-DevVenvWorks)) {
        Write-ConsoleStep -Label 'Backend venv' -Status fail -Detail 'does not start; was the folder moved?'
        $ok = $false
    }

    if (-not $SkipFrontend -and -not (Test-Path (Join-Path $paths.Frontend 'node_modules'))) {
        Write-ConsoleStep -Label 'Frontend packages' -Status fail -Detail 'not installed (cd frontend; npm ci)'
        $ok = $false
    }

    if (-not $SkipFrontend) {
        $missing = @($DevGeneratedSources | Where-Object {
                -not (Test-Path (Join-Path $paths.Frontend ('src\shared\{0}' -f $_)))
            })
        if ($missing.Count -gt 0) {
            Write-ConsoleStep -Label 'API types' -Status fail -Detail ('missing {0}' -f ($missing -join ', '))
            $ok = $false
        }
    }

    if (-not $ok) {
        Write-ConsoleResult -Status fail -Message 'DataForge needs setup first.' `
            -Lines @('Run setup.bat from the project root, then try again.')
    }
    return $ok
}

function Sync-FrontendDependencies {
    $paths = Get-DevPaths
    $lock = Join-Path $paths.Frontend 'package-lock.json'
    $installed = Join-Path $paths.Frontend 'node_modules\.package-lock.json'
    if (-not (Test-Path $lock)) { return $true }
    if ((Test-Path $installed) -and ((Get-Item $lock).LastWriteTimeUtc -le (Get-Item $installed).LastWriteTimeUtc)) {
        return $true
    }

    try {
        [void](Invoke-ConsoleStep -Label 'Frontend packages' -FilePath (Get-NpmCommand) `
                -ArgumentList @('ci') -WorkingDirectory $paths.Frontend `
                -Detail { param($text) '{0}, package-lock.json changed' -f (Get-DevNpmDetail $text) })
        return $true
    } catch {
        Write-ConsoleFailure 'The frontend packages could not be installed.'
        return $false
    }
}

function Test-BackendDependencyDrift {
    <#
    .SYNOPSIS
      Warns when a git pull brought in backend dependencies that were never
      installed. Advisory only - it never blocks startup.

    .DESCRIPTION
      No frontend arm: Sync-FrontendDependencies already reinstalled from the lockfile.
    #>
    $paths = Get-DevPaths
    $stale = $false

    # Written by setup.bat after a successful pip install.
    $stamp = Join-Path $paths.Backend '.venv\.dataforge-deps-stamp'
    if (Test-Path $stamp) {
        $stampTime = (Get-Item $stamp).LastWriteTimeUtc
        foreach ($name in @('requirements.txt', 'requirements-dev.txt', 'requirements-tagging.txt')) {
            $req = Join-Path $paths.Backend $name
            if ((Test-Path $req) -and ((Get-Item $req).LastWriteTimeUtc -gt $stampTime)) {
                Write-ConsoleStep -Label 'Backend packages' -Status warn `
                    -Detail ('backend\{0} changed since the last install' -f $name)
                $stale = $true
            }
        }
    }

    if ($stale) { Write-ConsoleNote 'Run setup.bat if the API fails to import something.' }
    return $stale
}

# Written only after a successful build; dist\index.html alone could be half-finished.
$DevBuildStampName = '.dataforge-build-stamp'

# Everything vite build reads, generated src\shared files included.
$DevBuildInputDirs = @('src', 'public')
$DevBuildInputFiles = @('index.html', 'package.json', 'package-lock.json', 'vite.config.ts')
$DevBuildInputPatterns = @('tsconfig*.json')

function Get-FrontendSourceStamp {
    <#
    .SYNOPSIS
      The newest write time across every input to a frontend build, or $null when
      none of them exist.
    #>
    $paths = Get-DevPaths
    $newest = $null

    $items = @()
    foreach ($dir in $DevBuildInputDirs) {
        $full = Join-Path $paths.Frontend $dir
        if (Test-Path $full) { $items += @(Get-ChildItem -LiteralPath $full -Recurse -File -ErrorAction SilentlyContinue) }
    }
    foreach ($file in $DevBuildInputFiles) {
        $full = Join-Path $paths.Frontend $file
        if (Test-Path -LiteralPath $full -PathType Leaf) { $items += @(Get-Item -LiteralPath $full) }
    }
    foreach ($pattern in $DevBuildInputPatterns) {
        $items += @(Get-ChildItem -Path (Join-Path $paths.Frontend $pattern) -File -ErrorAction SilentlyContinue)
    }

    foreach ($item in $items) {
        if ($null -eq $newest -or $item.LastWriteTimeUtc -gt $newest) { $newest = $item.LastWriteTimeUtc }
    }
    return $newest
}

function Test-DistFresh {
    <#
    .SYNOPSIS
      Whether frontend\dist was built after the last source change.

    .DESCRIPTION
      A tie counts as stale: Windows write times are coarse enough that a source
      saved in the same tick as the stamp would otherwise be missed, and rebuilding
      once too often is the cheaper mistake.
    #>
    $paths = Get-DevPaths
    $stamp = Join-Path $paths.Dist $DevBuildStampName
    if (-not (Test-Path -LiteralPath $stamp -PathType Leaf)) { return $false }
    if (-not (Test-Path -LiteralPath (Join-Path $paths.Dist 'index.html') -PathType Leaf)) { return $false }

    $newestSource = Get-FrontendSourceStamp
    if ($null -eq $newestSource) { return $true }

    return (Get-Item -LiteralPath $stamp).LastWriteTimeUtc -gt $newestSource
}

function Invoke-FrontendBuild {
    <#
    .SYNOPSIS
      Runs 'npm run build' in frontend\ and stamps the result. Returns $false when
      the build failed.

    .DESCRIPTION
      Captured; a failure prints the compiler errors.
    #>
    param([string]$Reason = 'sources changed')
    $paths = Get-DevPaths
    try {
        # Get-NpmCommand also puts the portable node on PATH for the lifecycle scripts.
        [void](Invoke-ConsoleStep -Label 'Frontend build' -FilePath (Get-NpmCommand) `
                -ArgumentList @('run', 'build') -WorkingDirectory $paths.Frontend `
                -Detail { $Reason })
    } catch {
        Write-ConsoleFailure 'The frontend build failed. Fix the errors above and try again.'
        return $false
    }

    $stamp = Join-Path $paths.Dist $DevBuildStampName
    Set-Content -LiteralPath $stamp -Value ((Get-Date).ToString('o')) -Encoding ASCII
    return $true
}

function Get-DevPortListener {
    <#
    .SYNOPSIS
      Processes listening on a port, as Process objects. Empty when the port is free.
    #>
    param([Parameter(Mandatory = $true)][int]$Port)

    $connections = @()
    try {
        $connections = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop)
    } catch {
        # No listener, or Get-NetTCPConnection is unavailable on this host.
        return @()
    }

    $processes = @()
    foreach ($owner in ($connections | Select-Object -ExpandProperty OwningProcess -Unique)) {
        if (-not $owner -or $owner -eq 0) { continue }
        try {
            $processes += Get-Process -Id $owner -ErrorAction Stop
        } catch {
            # Exited between the query and the lookup, or not ours to inspect.
        }
    }
    return $processes
}

function Test-DevOwnedProcess {
    <#
    .SYNOPSIS
      Whether a process is a DataForge server from this folder: its program or its command
      line lies inside the project root.

    .DESCRIPTION
      Matches the portable and venv interpreters, and a global node running this
      frontend's Vite. Another project's server, or another DataForge checkout, does not
      match. A process whose details cannot be read counts as foreign, so it is left alone.
    #>
    param([Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process)

    $root = (Get-DevPaths).Root.TrimEnd('\') + '\'
    try {
        $info = Get-CimInstance Win32_Process -Filter ('ProcessId={0}' -f $Process.Id) -ErrorAction Stop
    } catch {
        return $false
    }
    if (-not $info) { return $false }
    $exe = [string]$info.ExecutablePath
    $command = [string]$info.CommandLine
    return $exe.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or
        ($command.IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -ge 0)
}

function Stop-DevTree {
    <#
    .SYNOPSIS
      Kills a process and everything below it.

    .DESCRIPTION
      /T kills the tree: cmd -> python -> uvicorn reload child, or cmd -> npm -> node.
    #>
    param([Parameter(Mandatory = $true)][int]$ProcessId)

    if ($ProcessId -le 0) { return }

    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & taskkill.exe /PID $ProcessId /T /F 2>$null | Out-Null
    } catch {
        # Already gone.
    } finally {
        $ErrorActionPreference = $previous
    }
}

function Register-DevExitGuard {
    <#
    .SYNOPSIS
      Makes closing the launcher window stop the spawned server consoles.

    .DESCRIPTION
      Windows PowerShell skips finally blocks on CTRL_CLOSE_EVENT, and the servers are
      separate windows, so a console control handler kills the recorded PIDs.
      Paths that leave servers running (-Detach, readiness failure) must call
      Unregister-DevExitGuard first.
    #>
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyCollection()]
        [int[]]$ProcessId
    )

    if (-not ('DevConsoleGuard' -as [type])) {
        try {
            # Compiled on first use, so stop.ps1 never pays for it.
            Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

public static class DevConsoleGuard
{
    public delegate bool CtrlHandler(uint ctrlType);

    // Static so the GC cannot collect the delegate while Windows still holds the
    // native function pointer. A collected callback would crash the launcher at
    // the exact moment it is being asked to clean up.
    private static CtrlHandler _handler;
    private static int[] _pids = new int[0];

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetConsoleCtrlHandler(CtrlHandler handler, bool add);

    public static void Arm(int[] pids)
    {
        _pids = (pids == null) ? new int[0] : pids;
        if (_handler == null)
        {
            _handler = new CtrlHandler(OnCtrl);
            SetConsoleCtrlHandler(_handler, true);
        }
    }

    public static void Disarm()
    {
        _pids = new int[0];
    }

    // Every control type is treated alike. Ctrl+C during the readiness wait kills
    // this process just as dead as the X button does, and a duplicate taskkill on
    // an already-stopped tree is harmless.
    private static bool OnCtrl(uint ctrlType)
    {
        // Windows allows roughly five seconds after a close event before killing
        // this process, so the handler does nothing here but the kills. Calling
        // back into PowerShell from this thread is not safe.
        int[] pids = _pids;
        foreach (int pid in pids)
        {
            try
            {
                ProcessStartInfo info = new ProcessStartInfo("taskkill.exe", "/PID " + pid + " /T /F");
                info.UseShellExecute = false;
                info.CreateNoWindow = true;
                Process killer = Process.Start(info);
                if (killer != null) { killer.WaitForExit(3000); }
            }
            catch
            {
                // Already gone, or not ours to kill.
            }
        }

        // false: let the default handler run, so the launcher still exits.
        return false;
    }
}
'@
        } catch {
            Write-ConsoleWarning 'Could not install the window-close guard.' `
                @('Closing this window with X leaves the servers running; stop.bat stops them.')
            return
        }
    }

    [DevConsoleGuard]::Arm([int[]]@($ProcessId | Where-Object { $_ -gt 0 }))
}

function Unregister-DevExitGuard {
    <#
    .SYNOPSIS
      Stops the window-close guard from killing anything.

    .DESCRIPTION
      For exits that leave servers running; the handler stays with an empty list.
    #>
    if ('DevConsoleGuard' -as [type]) { [DevConsoleGuard]::Disarm() }
}

function Clear-DevPort {
    <#
    .SYNOPSIS
      Frees a dev port held by a leftover DataForge server from this folder.

    .DESCRIPTION
      Anything else, another project's python or node included, is named and left alone,
      never killed. Returns $true when the port is free afterwards.
    #>
    param(
        [Parameter(Mandatory = $true)][int]$Port,
        # Reports only problems: for the backstop after stopping supervised servers.
        [switch]$Quiet,
        # Reports a free port too: for stop.ps1, where that is the whole answer.
        [switch]$ReportFree
    )

    $label = 'Port {0}' -f $Port
    $listeners = @(Get-DevPortListener -Port $Port)
    if ($listeners.Count -eq 0) {
        if ($ReportFree) { Write-ConsoleStep -Label $label -Detail 'free' }
        return $true
    }

    $foreign = @($listeners | Where-Object { -not (Test-DevOwnedProcess $_) })
    if ($foreign.Count -gt 0) {
        $holders = ($foreign | ForEach-Object { '{0} (PID {1})' -f $_.ProcessName, $_.Id }) -join ', '
        Write-ConsoleStep -Label $label -Status fail -Detail "held by $holders"
        Write-ConsoleNote 'Not a DataForge server from this folder, so it was left running.'
        Write-ConsoleNote 'Stop it, or set DATAFORGE_API_PORT / DATAFORGE_UI_PORT in .env, and try again.'
        return $false
    }

    if (-not $Quiet) { Start-ConsoleStep $label }
    $stopped = ($listeners | ForEach-Object { '{0} (PID {1})' -f $_.ProcessName, $_.Id }) -join ', '
    foreach ($proc in $listeners) { Stop-DevTree -ProcessId $proc.Id }

    # Lazily released sockets are as fatal as occupied ones under Vite's strictPort.
    $deadline = (Get-Date).AddSeconds(5)
    while ((Get-Date) -lt $deadline) {
        if ((Get-DevPortListener -Port $Port).Count -eq 0) {
            if (-not $Quiet) { Complete-ConsoleStep -Detail "stopped leftover $stopped" }
            return $true
        }
        Start-Sleep -Milliseconds 200
    }

    if ($Quiet) {
        # The caller's own step stays open; it reports the overall outcome.
        Write-ConsoleStep -Label $label -Status fail -Detail "still in use after stopping $stopped"
    } else {
        Complete-ConsoleStep -Status fail -Detail "still in use after stopping $stopped"
    }
    return $false
}

function Wait-HttpReady {
    <#
    .SYNOPSIS
      Polls a URL until it answers 200. Returns $false on timeout, or as soon as
      the watched process exits. Keeps the running step's line alive meanwhile.
    #>
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [int]$TimeoutSec = 40,
        [System.Diagnostics.Process]$Process
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        Update-ConsoleStep ('waiting for {0}' -f ([uri]$Url).AbsolutePath)
        if ($Process -and $Process.HasExited) { return $false }
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($response.StatusCode -eq 200) { return $true }
        } catch {
            # Not serving yet.
        }
        Start-Sleep -Milliseconds 400
    }
    return $false
}

function Wait-TcpReady {
    <#
    .SYNOPSIS
      Polls until a TCP port accepts a connection. Used for Vite, which has no
      health endpoint of its own.
    #>
    param(
        [Parameter(Mandatory = $true)][int]$Port,
        [string]$ComputerName = '127.0.0.1',
        [int]$TimeoutSec = 60,
        [System.Diagnostics.Process]$Process
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        Update-ConsoleStep ('waiting for port {0}' -f $Port)
        if ($Process -and $Process.HasExited) { return $false }

        # Test-NetConnection is far too slow to poll with.
        $client = New-Object System.Net.Sockets.TcpClient
        try {
            $async = $client.BeginConnect($ComputerName, $Port, $null, $null)
            if ($async.AsyncWaitHandle.WaitOne(500)) {
                $client.EndConnect($async)
                return $true
            }
        } catch {
            # Refused - not listening yet.
        } finally {
            $client.Close()
        }
        Start-Sleep -Milliseconds 300
    }
    return $false
}

function Start-DevConsole {
    <#
    .SYNOPSIS
      Opens a titled cmd window running one server, and returns its Process.

    .DESCRIPTION
      cmd /k keeps the window open after Ctrl+C so the last lines of a crash stay
      readable. The returned PID is the console, not the server - stop it with
      Stop-DevTree.
    #>
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [string[]]$Banner = @(),
        [Parameter(Mandatory = $true)][string]$Command
    )

    $parts = @("title $Title", "cd /d `"$WorkingDirectory`"")
    foreach ($line in $Banner) { $parts += "echo $line" }
    $parts += 'echo.'
    $parts += $Command

    return Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', ($parts -join ' && ') -PassThru
}
