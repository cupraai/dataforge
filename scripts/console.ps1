# Console output shared by every PowerShell script; dot-source it. Twin: scripts/console.sh.
# Keep this file ASCII-only: Windows PowerShell 5.1 reads BOM-less scripts as ANSI.
#
# Every script prints the shape scripts/run_checks.py set:
#
#   DataForge setup                      Write-ConsoleTitle, once
#     Python 3.13.5 and Node 26.1.0      dim context lines
#
#     + Backend packages  42.1s  ...     one line per step, "." live while it runs
#         note                           Add-ConsoleNote, listed under its step
#
#   Setup complete in 1m 03s.            Write-ConsoleResult, once
#
# Child processes run captured (Invoke-ConsoleCommand), and their output shows only on failure.

$script:ConsoleLive = -not [Console]::IsOutputRedirected
$script:ConsoleColor = [string]::IsNullOrEmpty($env:NO_COLOR)
# Write-Host reaches a real console as UTF-16; a redirect is encoded with the console code page.
$script:ConsoleFancy = $script:ConsoleLive -or [Console]::OutputEncoding.CodePage -eq 65001
$script:ConsoleGlyphs = if ($script:ConsoleFancy) {
    @{ ok = [string][char]0x2713; fail = [string][char]0x2717; warn = '!'; skip = '-'
       run = [string][char]0x00B7; more = [string][char]0x2026 }
} else {
    @{ ok = '+'; fail = 'x'; warn = '!'; skip = '-'; run = '>'; more = '...' }
}
$script:ConsoleTones = @{
    ok = 'Green'; fail = 'Red'; warn = 'Yellow'; dim = 'DarkGray'; bold = 'White'; accent = 'Cyan'
}
$script:ConsoleLabelWidth = 18
$script:ConsolePendingWidth = 0
$script:ConsoleStep = $null
# Blocks are separated by one blank line, however they are combined.
$script:ConsoleAfterBlank = $true
# A failure dump keeps the end, where pip, npm and git put the actual error.
$script:ConsoleDumpLines = 60

function Write-ConsolePart {
    param([AllowEmptyString()][string]$Text, [string]$Tone = '')
    $color = $script:ConsoleTones[$Tone]
    if ($script:ConsoleColor -and $color) {
        Write-Host $Text -NoNewline -ForegroundColor $color
    } else {
        Write-Host $Text -NoNewline
    }
}

function Write-ConsoleLine {
    <#
    .SYNOPSIS
      One line, as alternating text and tone arguments: 'Label', 'bold', ' detail', 'dim'.
    #>
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Parts)
    Clear-ConsolePending
    for ($index = 0; $index -lt $Parts.Count; $index += 2) {
        $tone = if ($index + 1 -lt $Parts.Count) { $Parts[$index + 1] } else { '' }
        Write-ConsolePart $Parts[$index] $tone
    }
    Write-Host ''
    $script:ConsoleAfterBlank = $false
}

function Write-ConsoleBlank {
    Clear-ConsolePending
    if (-not $script:ConsoleAfterBlank) { Write-Host '' }
    $script:ConsoleAfterBlank = $true
}

function Get-ConsoleWidth {
    try { return [Math]::Max(40, $Host.UI.RawUI.WindowSize.Width) } catch { return 80 }
}

function Get-ConsoleShortText {
    param([AllowEmptyString()][string]$Text, [int]$Width)
    if ($Width -le 0) { return '' }
    if ($Text.Length -le $Width) { return $Text }
    $more = $script:ConsoleGlyphs.more
    return $Text.Substring(0, [Math]::Max(0, $Width - $more.Length)) + $more
}

function Clear-ConsolePending {
    if ($script:ConsolePendingWidth -gt 0) {
        Write-Host ("`r" + (' ' * $script:ConsolePendingWidth) + "`r") -NoNewline
        $script:ConsolePendingWidth = 0
    }
}

function Format-ConsoleDuration {
    param([double]$Seconds)
    $culture = [Globalization.CultureInfo]::InvariantCulture
    if ([Math]::Round($Seconds, 1) -lt 60) { return [string]::Format($culture, '{0:0.0}s', $Seconds) }
    $total = [int][Math]::Round($Seconds)
    return '{0}m {1:00}s' -f [Math]::Floor($total / 60), ($total % 60)
}

function Format-ConsoleSize {
    param([long]$Bytes)
    # Invariant, so a German console does not print 1,2 MB beside 59.25.
    $culture = [Globalization.CultureInfo]::InvariantCulture
    if ($Bytes -ge 1GB) { return [string]::Format($culture, '{0:0.0} GB', $Bytes / 1GB) }
    if ($Bytes -ge 1MB) { return [string]::Format($culture, '{0:0.0} MB', $Bytes / 1MB) }
    return [string]::Format($culture, '{0:0} KB', $Bytes / 1KB)
}

function Format-ConsoleCount {
    param([int]$Count, [string]$Noun)
    if ($Count -eq 1) { return "1 $Noun" }
    return "$Count ${Noun}s"
}

function Write-ConsoleTitle {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [string[]]$Lines = @(),
        [int]$LabelWidth = 18
    )
    $script:ConsoleLabelWidth = $LabelWidth
    try { $Host.UI.RawUI.WindowTitle = $Title } catch { }
    Write-ConsoleLine $Title 'bold'
    foreach ($line in $Lines) { Write-ConsoleLine "  $line" 'dim' }
    Write-ConsoleBlank
}

function Write-ConsoleStep {
    <#
    .SYNOPSIS
      A finished step: glyph, padded label, duration column, detail.

    .DESCRIPTION
      Without -Seconds the duration column stays blank, so details line up either way.
    #>
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [ValidateSet('ok', 'fail', 'warn', 'skip')][string]$Status = 'ok',
        [string]$Detail = '',
        [double]$Seconds = -1
    )
    $duration = if ($Seconds -ge 0.1) { Format-ConsoleDuration $Seconds } else { '' }
    $labelTone = if ($Status -eq 'skip') { 'dim' } else { '' }
    $detailTone = switch ($Status) { 'fail' { 'fail' } 'warn' { 'warn' } default { 'dim' } }
    Clear-ConsolePending
    Write-ConsolePart '  '
    Write-ConsolePart $script:ConsoleGlyphs[$Status] $(if ($Status -eq 'skip') { 'dim' } else { $Status })
    if ($Detail -or $duration) {
        Write-ConsolePart (' ' + $Label.PadRight($script:ConsoleLabelWidth) + '  ') $labelTone
        Write-ConsolePart $duration.PadLeft(6) 'dim'
    } else {
        Write-ConsolePart " $Label" $labelTone
    }
    if ($Detail) { Write-ConsolePart "  $Detail" $detailTone }
    Write-Host ''
    $script:ConsoleAfterBlank = $false
}

function Write-ConsoleNote {
    param([AllowEmptyString()][string]$Text, [string]$Tone = 'dim')
    Write-ConsoleLine "      $Text" $Tone
}

function Start-ConsoleStep {
    <#
    .SYNOPSIS
      Begins a timed step and shows it as running until Complete-ConsoleStep.
    #>
    param([Parameter(Mandatory = $true)][string]$Label)
    if ($script:ConsoleStep) { Complete-ConsoleStep }
    $script:ConsoleStep = [pscustomobject]@{
        Label = $Label
        Clock = [Diagnostics.Stopwatch]::StartNew()
        Notes = New-Object System.Collections.ArrayList
    }
    Update-ConsoleStep
}

function Update-ConsoleStep {
    <#
    .SYNOPSIS
      Redraws the running line with the elapsed time and what the step is doing now.
    #>
    param([string]$Activity = '')
    $step = $script:ConsoleStep
    if (-not $script:ConsoleLive -or -not $step) { return }
    $text = '  {0} {1}...' -f $script:ConsoleGlyphs.run, $step.Label
    $seconds = [int][Math]::Floor($step.Clock.Elapsed.TotalSeconds)
    if ($seconds -ge 60) {
        $text += '  {0}m {1:00}s' -f [Math]::Floor($seconds / 60), ($seconds % 60)
    } elseif ($seconds -ge 1) {
        $text += "  ${seconds}s"
    }
    if ($Activity) { $text += '  ' + $Activity }
    # A wrapped line cannot be redrawn with a carriage return.
    $text = Get-ConsoleShortText $text ((Get-ConsoleWidth) - 1)
    $padding = ' ' * [Math]::Max(0, $script:ConsolePendingWidth - $text.Length)
    Write-Host "`r" -NoNewline
    Write-ConsolePart ($text + $padding) 'dim'
    $script:ConsolePendingWidth = [Math]::Max($script:ConsolePendingWidth, $text.Length)
}

function Add-ConsoleNote {
    <#
    .SYNOPSIS
      A line listed under the running step once it finishes; printed now outside a step.
    #>
    param([AllowEmptyString()][string]$Text, [string]$Tone = 'dim')
    if ($script:ConsoleStep) {
        [void]$script:ConsoleStep.Notes.Add(@($Text, $Tone))
    } else {
        Write-ConsoleNote $Text $Tone
    }
}

function Complete-ConsoleStep {
    param(
        [ValidateSet('ok', 'fail', 'warn', 'skip')][string]$Status = 'ok',
        [string]$Detail = ''
    )
    $step = $script:ConsoleStep
    if (-not $step) { return }
    $script:ConsoleStep = $null
    Write-ConsoleStep -Label $step.Label -Status $Status -Detail $Detail `
        -Seconds $step.Clock.Elapsed.TotalSeconds
    foreach ($note in $step.Notes) { Write-ConsoleNote $note[0] $note[1] }
}

function Write-ConsoleOutput {
    <#
    .SYNOPSIS
      A failed command's captured output, under a header naming the command.
    #>
    param(
        [string]$Command = '',
        [int]$ExitCode = 0,
        [AllowEmptyString()][string]$Text = ''
    )
    Write-ConsoleBlank
    if ($Command) {
        Write-ConsoleLine ('  $ {0}  (exit {1})' -f $Command, $ExitCode) 'dim'
        Write-ConsoleBlank
    }
    $lines = @(($Text -replace "`r", '').TrimEnd("`n") -split "`n")
    if ($lines.Count -gt $script:ConsoleDumpLines) {
        $hidden = $lines.Count - $script:ConsoleDumpLines
        $log = Join-Path $env:TEMP ('dataforge-{0:yyyyMMdd-HHmmss}.log' -f (Get-Date))
        [IO.File]::WriteAllText($log, $Text, (New-Object Text.UTF8Encoding($false)))
        Write-ConsoleLine ('  {0} {1} earlier lines in {2}' -f $script:ConsoleGlyphs.more, $hidden, $log) 'dim'
        $lines = $lines[$hidden..($lines.Count - 1)]
    }
    foreach ($line in $lines) { Write-Host $line }
    $script:ConsoleAfterBlank = $false
    Write-ConsoleBlank
}

function Write-ConsoleWarning {
    param([Parameter(Mandatory = $true)][string]$Text, [string[]]$Notes = @())
    Write-ConsoleLine ('  {0} ' -f $script:ConsoleGlyphs.warn) 'warn' $Text 'warn'
    foreach ($note in $Notes) { Write-ConsoleNote $note }
}

function Write-ConsoleResult {
    <#
    .SYNOPSIS
      The closing summary: one bold line, then plain follow-up lines.
    #>
    param(
        [Parameter(Mandatory = $true)][string]$Message,
        [ValidateSet('ok', 'fail', 'warn', 'plain')][string]$Status = 'ok',
        [string[]]$Lines = @()
    )
    if ($script:ConsoleStep) {
        Complete-ConsoleStep -Status $(if ($Status -eq 'fail') { 'fail' } else { 'ok' })
    }
    Write-ConsoleBlank
    Write-ConsoleLine $Message $(if ($Status -eq 'plain') { 'bold' } else { $Status })
    foreach ($line in $Lines) { Write-ConsoleLine "  $line" }
}

function Write-ConsoleFailure {
    <#
    .SYNOPSIS
      Marks the running step failed and closes with the reason. For catch blocks.
    #>
    param(
        [Parameter(Mandatory = $true)][string]$Message,
        [string[]]$Lines = @()
    )
    if ($script:ConsoleStep) { Complete-ConsoleStep -Status fail }
    Write-ConsoleResult -Status fail -Message $Message -Lines $Lines
}

function Wait-ConsoleKey {
    param([string]$Prompt = 'Press any key to stop.')
    Write-ConsoleLine $Prompt 'accent'
    try {
        [void]$Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
    } catch {
        # No interactive console (redirected stdin): fall back to a line read.
        [void](Read-Host)
    }
}

function ConvertTo-ConsoleArgument {
    # The quoting CommandLineToArgvW undoes; Start-Process passes one string as-is.
    param([AllowEmptyString()][string]$Value)
    if ($Value.Length -gt 0 -and $Value -notmatch '[\s"]') { return $Value }
    $escaped = $Value -replace '(\\*)"', '$1$1\"'
    $escaped = $escaped -replace '(\\+)$', '$1$1'
    return '"' + $escaped + '"'
}

function Read-ConsoleTail {
    # The last line a running child wrote, read without blocking its writes.
    param([string]$Path)
    try {
        $stream = [IO.File]::Open($Path, 'Open', 'Read', 'ReadWrite')
        try {
            $count = [int][Math]::Min($stream.Length, 4096)
            if ($count -eq 0) { return '' }
            [void]$stream.Seek(-$count, 'End')
            $buffer = New-Object byte[] $count
            $read = $stream.Read($buffer, 0, $count)
        } finally {
            $stream.Dispose()
        }
    } catch {
        return ''
    }
    $lines = @([Text.Encoding]::UTF8.GetString($buffer, 0, $read) -split "[`r`n]+" |
            Where-Object { $_.Trim() })
    if ($lines.Count -eq 0) { return '' }
    return $lines[$lines.Count - 1].Trim()
}

function Read-ConsoleCapture {
    param([string]$Path)
    try { return [IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8) } catch { return '' }
}

function Invoke-ConsoleCommand {
    <#
    .SYNOPSIS
      Runs a program with its output captured, keeping the running step's line alive.

    .DESCRIPTION
      Returns ExitCode and Output (stdout, then stderr). While it runs, the step line shows
      the newest output line, or what -Activity returns. Python children run unbuffered and
      in UTF-8, so that line is current and the capture decodes.
    #>
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$ArgumentList = @(),
        [string]$WorkingDirectory = (Get-Location).ProviderPath,
        [scriptblock]$Activity
    )
    $stdout = [IO.Path]::GetTempFileName()
    $stderr = [IO.Path]::GetTempFileName()
    $saved = @{ PYTHONUNBUFFERED = $env:PYTHONUNBUFFERED; PYTHONIOENCODING = $env:PYTHONIOENCODING }
    $env:PYTHONUNBUFFERED = '1'
    $env:PYTHONIOENCODING = 'utf-8'
    $process = $null
    try {
        $start = @{
            FilePath               = $FilePath
            WorkingDirectory       = $WorkingDirectory
            RedirectStandardOutput = $stdout
            RedirectStandardError  = $stderr
            NoNewWindow            = $true
            PassThru               = $true
        }
        if ($ArgumentList.Count -gt 0) {
            $start.ArgumentList = ($ArgumentList | ForEach-Object { ConvertTo-ConsoleArgument $_ }) -join ' '
        }
        $process = Start-Process @start
        # Without a handle taken before exit, ExitCode reads as empty afterwards.
        [void]$process.Handle
        while (-not $process.WaitForExit(200)) {
            if ($Activity) {
                Update-ConsoleStep (& $Activity)
            } else {
                $newest = $stdout
                if ((Get-Item -LiteralPath $stderr).LastWriteTimeUtc -gt (Get-Item -LiteralPath $stdout).LastWriteTimeUtc) {
                    $newest = $stderr
                }
                Update-ConsoleStep (Read-ConsoleTail $newest)
            }
        }
        $process.WaitForExit()
        $output = ((Read-ConsoleCapture $stdout).TrimEnd() + "`n" + (Read-ConsoleCapture $stderr).TrimEnd()).Trim()
        return [pscustomobject]@{ ExitCode = $process.ExitCode; Output = $output }
    } finally {
        if ($process -and -not $process.HasExited) {
            & taskkill.exe /PID $process.Id /T /F 2>$null | Out-Null
        }
        foreach ($name in $saved.Keys) { Set-Item -LiteralPath "env:$name" -Value $saved[$name] }
        Remove-Item -LiteralPath $stdout, $stderr -Force -ErrorAction SilentlyContinue
    }
}

function Invoke-ConsoleStep {
    <#
    .SYNOPSIS
      One captured command as one step. Returns its output; throws -Failure when it fails.

    .DESCRIPTION
      -Detail turns the output into the step's detail. A failure prints the output first.
      -WarnOnly reports a failure as a warning and returns $null instead of throwing.
    #>
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$ArgumentList = @(),
        [string]$WorkingDirectory = (Get-Location).ProviderPath,
        [scriptblock]$Detail,
        [scriptblock]$Activity,
        [string]$Failure = '',
        [string]$WarnOnly = ''
    )
    Start-ConsoleStep $Label
    $result = Invoke-ConsoleCommand -FilePath $FilePath -ArgumentList $ArgumentList `
        -WorkingDirectory $WorkingDirectory -Activity $Activity
    if ($result.ExitCode -eq 0) {
        $text = if ($Detail) { [string](& $Detail $result.Output) } else { '' }
        Complete-ConsoleStep -Detail $text
        return $result.Output
    }
    $command = (@([IO.Path]::GetFileNameWithoutExtension($FilePath)) + $ArgumentList) -join ' '
    if ($WarnOnly) {
        Complete-ConsoleStep -Status warn -Detail $WarnOnly
        Write-ConsoleOutput -Command $command -ExitCode $result.ExitCode -Text $result.Output
        return $null
    }
    Complete-ConsoleStep -Status fail -Detail ('exit {0}' -f $result.ExitCode)
    Write-ConsoleOutput -Command $command -ExitCode $result.ExitCode -Text $result.Output
    if (-not $Failure) { $Failure = "$Label failed." }
    throw $Failure
}
