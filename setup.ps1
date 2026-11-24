<#
.SYNOPSIS
  Downloads a portable Python and Node into this clone and installs every dependency.

.DESCRIPTION
  No global Python or Node is needed: both come from official zips into .python\ and
  .node\, then the venv, npm packages and generated types. On x64 a verified FFmpeg 7.1
  lands in .ffmpeg\. The optional tagger comes last; a failure there only warns.
  Double-click setup.bat for the same.

.PARAMETER SkipTagging
  Leave out the tagging packages and model.

.EXAMPLE
  .\setup.ps1

.EXAMPLE
  .\setup.ps1 -SkipTagging
#>

[CmdletBinding()]
param(
    [switch]$SkipTagging
)

$ErrorActionPreference = 'Stop'
# PowerShell 5.1 defaults to TLS 1.0, which the download hosts reject.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'

$Root = $PSScriptRoot
$PyVer = (Get-Content -LiteralPath (Join-Path $Root '.python-version') -Raw).Trim()
$NodeVer = (Get-Content -LiteralPath (Join-Path $Root '.node-version') -Raw).Trim()
# Bump all three together; the hash is of the release archive, checked before it is opened.
$FfmpegVer = '7.1.1'
$FfmpegUri = 'https://github.com/GyanD/codexffmpeg/releases/download/7.1.1/ffmpeg-7.1.1-essentials_build.zip'
$FfmpegSha256 = '04861d3339c5ebe38b56c19a15cf2c0cc97f5de4fa8910e4d47e5e6404e4a2d4'
$PyDir = Join-Path $Root '.python'
$NodeDir = Join-Path $Root '.node'
$PyExe = Join-Path $PyDir 'python.exe'
$NpmCmd = Join-Path $NodeDir 'npm.cmd'
$PyStampFile = Join-Path $PyDir 'setup-python-version.txt'
$NodeStampFile = Join-Path $NodeDir 'setup-node-version.txt'
$FfmpegDir = Join-Path $Root '.ffmpeg'
$FfmpegExe = Join-Path $FfmpegDir 'bin\ffmpeg.exe'
$FfmpegStampFile = Join-Path $FfmpegDir 'setup-ffmpeg-version.txt'
$VenvDir = Join-Path $Root 'backend\.venv'
$VenvPy = Join-Path $VenvDir 'Scripts\python.exe'
$PyVersionCheck = Join-Path $Root 'scripts\py_version.py'

. (Join-Path $Root 'scripts\dev-common.ps1')

function Get-SetupArch {
    if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') {
        return [pscustomobject]@{
            PythonPackage = 'pythonarm64'
            NodeBuild     = 'win-arm64'
            HasFfmpeg     = $false
        }
    }
    return [pscustomobject]@{
        PythonPackage = 'python'
        NodeBuild     = 'win-x64'
        HasFfmpeg     = $true
    }
}

function Test-StampMatches {
    param(
        [Parameter(Mandatory = $true)][string]$File,
        [Parameter(Mandatory = $true)][string]$Expected
    )
    if (-not (Test-Path -LiteralPath $File -PathType Leaf)) { return $false }
    $got = ((Get-Content -LiteralPath $File -TotalCount 1 -ErrorAction SilentlyContinue) + '')
    return $got.Trim() -eq $Expected
}

function Test-PythonVersion {
    param(
        [Parameter(Mandatory = $true)][string]$File,
        [switch]$Exact
    )
    if (-not (Test-Path -LiteralPath $File -PathType Leaf)) { return $false }
    try {
        if ($Exact) {
            $actual = (& $File -c 'import platform; print(platform.python_version())' 2>$null | Out-String).Trim()
            return $LASTEXITCODE -eq 0 -and $actual -eq $PyVer
        }
        & $File $PyVersionCheck 2>$null | Out-Null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

function Get-RemoteFile {
    param(
        [Parameter(Mandatory = $true)][string]$Uri,
        [Parameter(Mandatory = $true)][string]$OutFile
    )
    if (Test-Path -LiteralPath $OutFile) {
        Remove-Item -LiteralPath $OutFile -Force
    }

    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if ($curl) {
        # Retries ride out a dropped connection or a CDN hiccup; the timeout catches a dead host.
        $result = Invoke-ConsoleCommand -FilePath $curl.Source `
            -ArgumentList @('--fail', '--location', '--silent', '--show-error',
                '--retry', '3', '--retry-delay', '2', '--retry-connrefused', '--connect-timeout', '30',
                '--output', $OutFile, $Uri) `
            -Activity {
                $name = Split-Path -Leaf ([uri]$Uri).AbsolutePath
                if (Test-Path -LiteralPath $OutFile) {
                    '{0}  {1}' -f $name, (Format-ConsoleSize (Get-Item -LiteralPath $OutFile).Length)
                } else {
                    $name
                }
            }
        if ($result.ExitCode -ne 0) {
            throw "Download failed ($($result.Output)): $Uri"
        }
    } else {
        Update-ConsoleStep ('downloading {0}' -f $Uri)
        Invoke-WebRequest -Uri $Uri -OutFile $OutFile -UseBasicParsing
    }

    if (-not (Test-Path -LiteralPath $OutFile -PathType Leaf)) {
        throw "Download left no file: $Uri"
    }
    $length = (Get-Item -LiteralPath $OutFile).Length
    if ($length -lt 1MB) {
        throw "Download was too small to be a runtime ($length bytes): $Uri"
    }
}

function Get-RemoteJson {
    # Small metadata reads; three tries, like the downloads.
    param([Parameter(Mandatory = $true)][string]$Uri)
    for ($attempt = 1; ; $attempt++) {
        try {
            return Invoke-RestMethod -Uri $Uri -UseBasicParsing -TimeoutSec 30
        } catch {
            if ($attempt -ge 3) { throw "Could not read $Uri ($($_.Exception.Message))." }
            Start-Sleep -Seconds 2
        }
    }
}

function Assert-FileHash {
    <#
    .SYNOPSIS
      Throws unless a download matches its published digest, and deletes it when it does not.

    .PARAMETER Expected
      Lowercase hex, or base64 as NuGet publishes it.
    #>
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][ValidateSet('SHA256', 'SHA512')][string]$Algorithm,
        [Parameter(Mandatory = $true)][string]$Expected,
        [switch]$Base64
    )
    Update-ConsoleStep ('checking the {0} digest' -f $Algorithm)
    $hasher = [Security.Cryptography.HashAlgorithm]::Create($Algorithm)
    $stream = [IO.File]::OpenRead($Path)
    try {
        $digest = $hasher.ComputeHash($stream)
    } finally {
        $stream.Dispose()
        $hasher.Dispose()
    }
    $actual = if ($Base64) {
        [Convert]::ToBase64String($digest)
    } else {
        -join ($digest | ForEach-Object { $_.ToString('x2') })
    }
    if ($actual -cne $Expected) {
        Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
        throw "$(Split-Path -Leaf $Path) does not match its published $Algorithm digest (got $actual)."
    }
}

function Get-NuGetPackageHash {
    # The SHA-512 NuGet records for the exact .nupkg it serves, from its catalog.
    param([Parameter(Mandatory = $true)][string]$Package, [Parameter(Mandatory = $true)][string]$Version)
    $leaf = Get-RemoteJson ('https://api.nuget.org/v3/registration5-semver1/{0}/{1}.json' -f
        $Package.ToLowerInvariant(), $Version.ToLowerInvariant())
    $entry = Get-RemoteJson ([string]$leaf.catalogEntry)
    if ($entry.packageHashAlgorithm -ne 'SHA512' -or -not $entry.packageHash) {
        throw "NuGet lists no SHA-512 digest for $Package $Version."
    }
    return [string]$entry.packageHash
}

function Get-NodeArchiveHash {
    # nodejs.org publishes SHASUMS256.txt beside every release.
    param([Parameter(Mandatory = $true)][string]$FileName)
    $sums = Get-RemoteJson ('https://nodejs.org/dist/v{0}/SHASUMS256.txt' -f $NodeVer)
    foreach ($line in ([string]$sums -split "`n")) {
        $fields = $line.Trim() -split '\s+'
        if ($fields.Count -eq 2 -and $fields[1] -eq $FileName) { return $fields[0].ToLowerInvariant() }
    }
    throw "SHASUMS256.txt for Node.js $NodeVer does not list $FileName."
}

function Install-PortablePython {
    param([Parameter(Mandatory = $true)]$Arch)

    $uri = 'https://www.nuget.org/api/v2/package/{0}/{1}' -f $Arch.PythonPackage, $PyVer
    $zip = Join-Path $env:TEMP ('dataforge-python-{0}.zip' -f $PyVer)
    $extract = Join-Path $env:TEMP ('dataforge-python-{0}' -f $PyVer)

    $expected = Get-NuGetPackageHash -Package $Arch.PythonPackage -Version $PyVer
    Get-RemoteFile -Uri $uri -OutFile $zip
    Assert-FileHash -Path $zip -Algorithm SHA512 -Expected $expected -Base64

    if (Test-Path -LiteralPath $extract) {
        Remove-Item -LiteralPath $extract -Recurse -Force
    }
    Update-ConsoleStep 'extracting'
    Expand-Archive -Path $zip -DestinationPath $extract -Force
    Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue

    $found = Get-ChildItem -LiteralPath $extract -Filter 'python.exe' -Recurse -File |
        Where-Object { $_.Directory.Name -eq 'tools' } |
        Select-Object -First 1
    if (-not $found) {
        throw 'The Python package did not contain tools\python.exe.'
    }

    if (Test-Path -LiteralPath $PyDir) {
        Remove-Item -LiteralPath $PyDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $PyDir | Out-Null
    Get-ChildItem -LiteralPath $found.Directory.FullName | Move-Item -Destination $PyDir -Force
    Remove-Item -LiteralPath $extract -Recurse -Force -ErrorAction SilentlyContinue

    if (-not (Test-Path -LiteralPath $PyExe -PathType Leaf)) {
        throw "Python extract failed: $PyExe is missing."
    }

    Set-Content -LiteralPath $PyStampFile -Value $PyVer -Encoding ASCII
}

function Install-PortableNode {
    param([Parameter(Mandatory = $true)]$Arch)

    $folder = 'node-v{0}-{1}' -f $NodeVer, $Arch.NodeBuild
    $uri = 'https://nodejs.org/dist/v{0}/{1}.zip' -f $NodeVer, $folder
    $zip = Join-Path $env:TEMP ('dataforge-{0}.zip' -f $folder)

    # A running dev server locks node.exe. Check before removing any part of its npm install.
    $installedNode = Join-Path $NodeDir 'node.exe'
    if (Test-Path -LiteralPath $installedNode) {
        try {
            [IO.File]::Open($installedNode, 'Open', 'ReadWrite', 'None').Dispose()
        } catch {
            throw 'Cannot replace .node\node.exe. Close the running DataForge session and retry setup.'
        }
    }

    $expected = Get-NodeArchiveHash -FileName ('{0}.zip' -f $folder)
    Get-RemoteFile -Uri $uri -OutFile $zip
    Assert-FileHash -Path $zip -Algorithm SHA256 -Expected $expected

    if (Test-Path -LiteralPath $NodeDir) {
        Remove-Item -LiteralPath $NodeDir -Recurse -Force
    }
    Update-ConsoleStep 'extracting'
    Expand-Archive -Path $zip -DestinationPath $NodeDir -Force
    Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue

    $nested = Join-Path $NodeDir $folder
    if (Test-Path -LiteralPath $nested) {
        Get-ChildItem -LiteralPath $nested | Move-Item -Destination $NodeDir -Force
        Remove-Item -LiteralPath $nested -Recurse -Force
    }

    if (-not (Test-Path -LiteralPath $NpmCmd -PathType Leaf)) {
        throw "Node extract failed: $NpmCmd is missing."
    }

    Set-Content -LiteralPath $NodeStampFile -Value $NodeVer -Encoding ASCII
}

function Install-PortableFfmpeg {
    $zip = Join-Path $env:TEMP ('dataforge-ffmpeg-{0}.zip' -f $FfmpegVer)
    $extract = Join-Path $env:TEMP ('dataforge-ffmpeg-{0}' -f $FfmpegVer)

    Get-RemoteFile -Uri $FfmpegUri -OutFile $zip
    Assert-FileHash -Path $zip -Algorithm SHA256 -Expected $FfmpegSha256

    if (Test-Path -LiteralPath $extract) {
        Remove-Item -LiteralPath $extract -Recurse -Force
    }
    Update-ConsoleStep 'extracting'
    Expand-Archive -Path $zip -DestinationPath $extract -Force
    Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue

    $found = Get-ChildItem -LiteralPath $extract -Filter 'ffmpeg.exe' -Recurse -File |
        Where-Object { $_.Directory.Name -eq 'bin' } |
        Select-Object -First 1
    if (-not $found) {
        throw 'The FFmpeg archive did not contain bin\ffmpeg.exe.'
    }

    if (Test-Path -LiteralPath $FfmpegDir) {
        Remove-Item -LiteralPath $FfmpegDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path (Join-Path $FfmpegDir 'bin') | Out-Null
    # Only ffmpeg.exe is used; the licence travels with the GPL build.
    Move-Item -LiteralPath $found.FullName -Destination $FfmpegExe
    $license = Join-Path $found.Directory.Parent.FullName 'LICENSE'
    if (Test-Path -LiteralPath $license) {
        Move-Item -LiteralPath $license -Destination (Join-Path $FfmpegDir 'LICENSE')
    }
    Remove-Item -LiteralPath $extract -Recurse -Force -ErrorAction SilentlyContinue

    Set-Content -LiteralPath $FfmpegStampFile -Value $FfmpegVer -Encoding ASCII
}

function Get-PipDetail {
    param([string]$Output)
    $installed = [regex]::Match($Output, '(?m)^Successfully installed (.+)$')
    if (-not $installed.Success) { return 'up to date' }
    $count = @($installed.Groups[1].Value.Trim() -split '\s+').Count
    return '{0} installed' -f (Format-ConsoleCount $count 'package')
}

function Get-LastLine {
    param([string]$Output)
    $lines = @($Output -split "`r?`n" | Where-Object { $_.Trim() })
    if ($lines.Count -eq 0) { return '' }
    return $lines[$lines.Count - 1].Trim()
}

function Get-FfmpegDetail {
    param([string]$Output)
    $lines = @($Output -split "`r?`n" | Where-Object { $_.Trim() })
    $version = [regex]::Match($Output, 'ffmpeg version n?(\d+\.\d+(?:\.\d+)?)')
    $where = if ($lines.Count -gt 0) { $lines[0].Trim() } else { '' }
    $rootPrefix = $Root.TrimEnd('\') + '\'
    if ($where.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        $where = $where.Substring($rootPrefix.Length)
    }
    if ($version.Success) { return '{0} at {1}' -f $version.Groups[1].Value, $where }
    return $where
}

Write-ConsoleTitle 'DataForge setup' @(
    ('Portable Python {0} and Node.js {1}, kept inside this folder' -f $PyVer, $NodeVer)
)
$clock = [Diagnostics.Stopwatch]::StartNew()

try {
    $pathProblem = Get-DevRootPathProblem
    if ($pathProblem) { throw $pathProblem }
    $arch = Get-SetupArch
    $pythonReplaced = $false

    if (Test-PythonVersion -File $PyExe -Exact) {
        Set-Content -LiteralPath $PyStampFile -Value $PyVer -Encoding ASCII
        Write-ConsoleStep -Label "Python $PyVer" -Detail 'already in .python\'
    } else {
        Start-ConsoleStep "Python $PyVer"
        Install-PortablePython -Arch $arch
        Complete-ConsoleStep -Detail ('installed to .python\ ({0}), SHA-512 verified' -f $arch.PythonPackage)
        $pythonReplaced = $true
    }

    $nodeReady = (Test-Path -LiteralPath $NpmCmd -PathType Leaf) -and (Test-StampMatches -File $NodeStampFile -Expected $NodeVer)
    if ($nodeReady) {
        Write-ConsoleStep -Label "Node.js $NodeVer" -Detail 'already in .node\'
    } else {
        Start-ConsoleStep "Node.js $NodeVer"
        Install-PortableNode -Arch $arch
        Complete-ConsoleStep -Detail ('installed to .node\ ({0}), SHA-256 verified' -f $arch.NodeBuild)
    }

    if (-not $arch.HasFfmpeg) {
        Write-ConsoleStep -Label 'FFmpeg' -Status skip -Detail 'no pinned ARM64 build; uses a 7.1.x on PATH or the bundled one'
    } elseif ((Test-Path -LiteralPath $FfmpegExe -PathType Leaf) -and (Test-StampMatches -File $FfmpegStampFile -Expected $FfmpegVer)) {
        Write-ConsoleStep -Label "FFmpeg $FfmpegVer" -Detail 'already in .ffmpeg\'
    } else {
        Start-ConsoleStep "FFmpeg $FfmpegVer"
        Install-PortableFfmpeg
        Complete-ConsoleStep -Detail 'installed to .ffmpeg\, SHA-256 verified'
    }

    $env:PATH = "$PyDir;$NodeDir;$env:PATH"

    Start-ConsoleStep 'Backend venv'
    $venvDetail = 'reused backend\.venv'
    if ((Test-Path -LiteralPath $VenvDir) -and ($pythonReplaced -or -not (Test-PythonVersion -File $VenvPy))) {
        $resolvedVenv = (Resolve-Path -LiteralPath $VenvDir).ProviderPath
        $workspacePrefix = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
        if (-not $resolvedVenv.StartsWith($workspacePrefix, [StringComparison]::OrdinalIgnoreCase)) {
            throw 'The backend venv is outside the project folder.'
        }
        Remove-Item -LiteralPath $resolvedVenv -Recurse -Force
        $venvDetail = "recreated backend\.venv for Python $PyVer"
    }

    if (-not (Test-Path -LiteralPath $VenvPy -PathType Leaf)) {
        if ($venvDetail -eq 'reused backend\.venv') { $venvDetail = 'created backend\.venv' }
        $result = Invoke-ConsoleCommand -FilePath $PyExe -ArgumentList @('-m', 'ensurepip', '--upgrade')
        if ($result.ExitCode -eq 0) {
            $result = Invoke-ConsoleCommand -FilePath $PyExe -ArgumentList @('-m', 'venv', $VenvDir)
        }
        if ($result.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $VenvPy -PathType Leaf)) {
            Complete-ConsoleStep -Status fail -Detail ('exit {0}' -f $result.ExitCode)
            Write-ConsoleOutput -Text $result.Output
            throw 'Failed to create backend\.venv.'
        }
    }
    if (-not (Test-PythonVersion -File $VenvPy)) { throw 'The backend venv must use Python 3.13.x.' }
    Complete-ConsoleStep -Detail $venvDetail

    [void](Invoke-ConsoleStep -Label 'pip' -FilePath $VenvPy `
            -ArgumentList @('-m', 'pip', 'install', '--upgrade', 'pip') `
            -Detail { param($text) if ($text -match 'Successfully installed pip-(\S+)') { "upgraded to $($Matches[1])" } else { 'up to date' } } `
            -Failure 'pip upgrade failed.')
    [void](Invoke-ConsoleStep -Label 'Backend packages' -FilePath $VenvPy `
            -ArgumentList @('-m', 'pip', 'install', '-r', (Join-Path $Root 'backend\requirements.txt'), '-r', (Join-Path $Root 'backend\requirements-dev.txt')) `
            -Detail { param($text) Get-PipDetail $text } `
            -Failure 'Backend dependency installation failed.')
    [void](Invoke-ConsoleStep -Label 'FFmpeg check' -FilePath $VenvPy `
            -ArgumentList @((Join-Path $Root 'scripts\check_ffmpeg.py')) `
            -Detail { param($text) Get-FfmpegDetail $text } `
            -Failure 'FFmpeg 7.1.x is required. Install a matching binary on PATH and run setup again.')
    if ($SkipTagging) {
        Write-ConsoleStep -Label 'Tagging' -Status skip -Detail 'left out (-SkipTagging)'
    } else {
        # Optional: a failure only warns, since everything else works without the tagger.
        [void](Invoke-ConsoleStep -Label 'Tagging' -FilePath $VenvPy `
                -ArgumentList @((Join-Path $Root 'scripts\setup_tagging.py')) `
                -Detail { param($text) Get-LastLine $text } `
                -WarnOnly 'could not be set up; everything else works. Run setup again to retry.')
    }
    Set-Content -LiteralPath (Join-Path $VenvDir '.dataforge-deps-stamp') -Value ((Get-Date).ToString('o')) -Encoding ASCII

    $FrontendDir = Join-Path $Root 'frontend'
    # npm ci installs the locked tree; npm install only when there is no lockfile yet.
    $npmVerb = if (Test-Path (Join-Path $FrontendDir 'package-lock.json')) { 'ci' } else { 'install' }
    [void](Invoke-ConsoleStep -Label 'Frontend packages' -FilePath $NpmCmd `
            -ArgumentList @($npmVerb) -WorkingDirectory $FrontendDir `
            -Detail { param($text) Get-DevNpmDetail $text } `
            -Failure "Frontend npm $npmVerb failed.")

    [void](Invoke-ConsoleStep -Label 'API types' -FilePath $VenvPy `
            -ArgumentList @((Join-Path $Root 'scripts\generate_types.py')) `
            -Detail { param($text) Get-DevGeneratedDetail $text } `
            -Failure 'Frontend type generation failed.')
} catch {
    Write-ConsoleFailure ('Setup failed: {0}' -f $_.Exception.Message) @('Fix the problem above and run setup.bat again.')
    exit 1
}

Write-ConsoleResult ('Setup complete in {0}.' -f (Format-ConsoleDuration $clock.Elapsed.TotalSeconds)) -Lines @(
    'Run start.bat to launch the app, or dev.bat to develop it.'
)
exit 0
