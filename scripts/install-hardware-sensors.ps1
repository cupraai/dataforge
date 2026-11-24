<#
.SYNOPSIS
  Shows CPU temperature and CPU power in the system specifications panel under Windows.

.DESCRIPTION
  Windows hides these from normal processes; the PawnIO driver can read them as admin.
  This installs PawnIO and its module and registers a hidden SYSTEM task that writes
  %ProgramData%\DataForge\sensors\sensors.json for the unelevated backend.
  The task runs only code from admin-only locations.

.PARAMETER Uninstall
  Stops and removes the task and the sensors folder. PawnIO stays installed, because
  other tools may rely on it.

.EXAMPLE
  scripts\install-hardware-sensors.bat

.EXAMPLE
  scripts\install-hardware-sensors.bat -Uninstall
#>

#Requires -RunAsAdministrator

[CmdletBinding()]
param(
    [switch] $Uninstall
)

$ErrorActionPreference = 'Stop'

$TaskName = 'DataForge hardware sensors'
# Installs before CPU power was added registered this task instead.
$OldTaskName = 'DataForge CPU temperature'
$DataForgeDir = Join-Path $env:ProgramData 'DataForge'
$SensorDir = Join-Path $DataForgeDir 'sensors'
$LoopScript = Join-Path $SensorDir 'sensor-loop.ps1'
$ReadingFile = Join-Path $SensorDir 'sensors.json'
$ErrorFile = Join-Path $SensorDir 'sensors.error'
$FirstReadingTimeoutSeconds = 20
$PowerReadingDelayMilliseconds = 1500
$PawnIoUninstallKey = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PawnIO'
$PawnIoSetupUrl = 'https://github.com/namazso/PawnIO.Setup/releases/download/2.2.0/PawnIO_setup.exe'
$PawnIoSetupSha256 = '1f519a22e47187f70a1379a48ca604981c4fcf694f4e65b734aaa74a9fba3032'
$RebootRequiredExitCode = 3010
$ModulesUrl = 'https://github.com/namazso/PawnIO.Modules/releases/download/0.2.11/release_0_2_11.zip'
$ModulesSha256 = '43608cb89bc84247fef1368a139013f7d043e17db6d6c8dfc9b46bf0905a81f4'

$SystemSid = 'S-1-5-18'
$AdministratorsSid = 'S-1-5-32-544'
$UsersSid = 'S-1-5-32-545'

. (Join-Path $PSScriptRoot 'console.ps1')

function Stop-SensorTask {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Stop-ScheduledTask -TaskName $TaskName
        Add-ConsoleNote "Stopped the running '$TaskName' task."
    }
}

function Remove-OldSensorTask {
    if (Get-ScheduledTask -TaskName $OldTaskName -ErrorAction SilentlyContinue) {
        Stop-ScheduledTask -TaskName $OldTaskName
        Unregister-ScheduledTask -TaskName $OldTaskName -Confirm:$false
        Add-ConsoleNote "Removed the older '$OldTaskName' task."
    }
}

function Assert-NotLink([string] $Path) {
    if ((Test-Path -LiteralPath $Path) -and
            ((Get-Item -LiteralPath $Path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw "$Path is a link. Remove it and run this script again."
    }
}

function New-AccessRule([string] $Sid, [Security.AccessControl.FileSystemRights] $Rights) {
    New-Object Security.AccessControl.FileSystemAccessRule(
        (New-Object Security.Principal.SecurityIdentifier($Sid)),
        $Rights,
        'ContainerInherit, ObjectInherit',
        'None',
        'Allow')
}

function Remove-SensorDir {
    Assert-NotLink $SensorDir
    if (Test-Path -LiteralPath $SensorDir) {
        Remove-Item -LiteralPath $SensorDir -Recurse -Force
    }
}

function New-SensorDir {
    # Any user may create folders in ProgramData, so an existing one may be theirs.
    Assert-NotLink $DataForgeDir
    New-Item -ItemType Directory -Force -Path $DataForgeDir | Out-Null
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetOwner((New-Object Security.Principal.SecurityIdentifier($AdministratorsSid)))
    $acl.SetAccessRuleProtection($true, $false)
    $acl.AddAccessRule((New-AccessRule $SystemSid 'FullControl'))
    $acl.AddAccessRule((New-AccessRule $AdministratorsSid 'FullControl'))
    $acl.AddAccessRule((New-AccessRule $UsersSid 'ReadAndExecute'))
    Set-Acl -LiteralPath $DataForgeDir -AclObject $acl
    Remove-SensorDir
    New-Item -ItemType Directory -Path $SensorDir | Out-Null
}

function Uninstall-Sensor {
    Stop-SensorTask
    Remove-OldSensorTask
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Remove-SensorDir
    if ((Test-Path -LiteralPath $DataForgeDir) -and -not (Get-ChildItem -LiteralPath $DataForgeDir -Force)) {
        Remove-Item -LiteralPath $DataForgeDir -Force
    }
}

function Get-CpuVendor($Cpu) {
    switch ($Cpu.Manufacturer) {
        'GenuineIntel' { return 'Intel' }
        'AuthenticAMD' { return 'AMD' }
    }
    throw "The sensors need an Intel or AMD CPU, but this one reports '$($Cpu.Manufacturer)'."
}

function Get-TctlOffset([string] $CpuName) {
    if ($CpuName -match '\b(1600X|1700X|1800X)\b') { return 20 }
    if ($CpuName -match '\b2700X\b') { return 10 }
    if ($CpuName -match 'Threadripper (19|29)\d\d') { return 27 }
    0
}

function Find-PawnIoDir {
    $installed = Get-ItemProperty -LiteralPath $PawnIoUninstallKey -ErrorAction SilentlyContinue
    $candidates = @(
        $(if ($installed.InstallLocation) { $installed.InstallLocation.Trim('"') }),
        (Join-Path $env:ProgramFiles 'PawnIO'))
    foreach ($directory in $candidates) {
        if ($directory -and (Test-Path -LiteralPath (Join-Path $directory 'PawnIOLib.dll'))) {
            return $directory
        }
    }
    $null
}

function Get-VerifiedDownload([string] $Url, [string] $Sha256) {
    # Stays in memory so nothing user-writable sits between the digest check and the locked folder.
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $client = New-Object Net.WebClient
    try {
        $content = $client.DownloadData($Url)
    } finally {
        $client.Dispose()
    }
    $hasher = [Security.Cryptography.SHA256]::Create()
    $digest = -join ($hasher.ComputeHash($content) | ForEach-Object { $_.ToString('x2') })
    $hasher.Dispose()
    if ($digest -ne $Sha256) {
        throw "$Url has digest $digest, expected $Sha256."
    }
    Add-ConsoleNote "$(Split-Path -Leaf $Url): $(Format-ConsoleSize $content.Length), SHA-256 verified."
    , $content
}

function Install-PawnIo([byte[]] $Setup) {
    # Runs from the locked folder: an elevated user's %TEMP% is still writable by unelevated code.
    $setupFile = Join-Path $SensorDir 'PawnIO_setup.exe'
    [IO.File]::WriteAllBytes($setupFile, $Setup)
    try {
        $exitCode = (Start-Process -FilePath $setupFile -ArgumentList '-install', '-silent' `
                -Wait -PassThru).ExitCode
    } finally {
        Remove-Item -LiteralPath $setupFile -Force
    }
    if ($exitCode -eq $RebootRequiredExitCode) {
        throw 'PawnIO was installed but needs a restart. Restart Windows and run this again.'
    }
    if ($exitCode -ne 0) {
        throw "PawnIO's setup failed with exit code $exitCode."
    }
    $directory = Find-PawnIoDir
    if (-not $directory) {
        throw "PawnIO's setup finished, but PawnIOLib.dll was not found."
    }
    $directory
}

function Save-Module([byte[]] $Archive, [string] $Name) {
    Add-Type -AssemblyName System.IO.Compression
    $zip = New-Object IO.Compression.ZipArchive((New-Object IO.MemoryStream(, $Archive)))
    try {
        $source = $zip.GetEntry($Name).Open()
        $target = [IO.File]::Create((Join-Path $SensorDir $Name))
        try {
            $source.CopyTo($target)
        } finally {
            $target.Dispose()
            $source.Dispose()
        }
    } finally {
        $zip.Dispose()
    }
}

function Wait-FirstReading {
    $clock = [Diagnostics.Stopwatch]::StartNew()
    while ($clock.Elapsed.TotalSeconds -lt $FirstReadingTimeoutSeconds) {
        if (Test-Path -LiteralPath $ReadingFile) {
            # Power is the difference between two rounds, so the first one never has it.
            Start-Sleep -Milliseconds $PowerReadingDelayMilliseconds
            return Get-Content -Raw -LiteralPath $ReadingFile | ConvertFrom-Json
        }
        Start-Sleep -Milliseconds 250
        Update-ConsoleStep
    }
    $null
}

function Get-LastFailure {
    try {
        (Get-Content -Raw -LiteralPath $ErrorFile).Trim()
    } catch {
        'No error was reported.'
    }
}

function Add-Reading([string] $Label, $Value, [string] $Unit) {
    if ($null -eq $Value) {
        Add-ConsoleNote ('{0,-18} unavailable' -f $Label) warn
    } else {
        # "$Value" stays invariant; -f alone would print 55,25 on a German system.
        Add-ConsoleNote ('{0,-18} {1} {2}' -f $Label, "$Value", $Unit) ok
    }
}

if ($Uninstall) {
    Write-ConsoleTitle 'DataForge hardware sensors' @('Removing the sensor task')
    try {
        Start-ConsoleStep 'Task'
        Stop-SensorTask
        Remove-OldSensorTask
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
        Complete-ConsoleStep -Detail "removed '$TaskName'"
        Start-ConsoleStep 'Sensor folder'
        Uninstall-Sensor
        Complete-ConsoleStep -Detail "removed $SensorDir"
    } catch {
        Write-ConsoleFailure ('Uninstall failed: {0}' -f $_.Exception.Message)
        exit 1
    }
    Write-ConsoleResult 'The hardware sensors are removed.' -Lines @(
        'PawnIO stays installed; remove it from Windows settings if nothing else needs it.'
    )
    return
}

Write-ConsoleTitle 'DataForge hardware sensors' @(
    'CPU temperature and power for the system specifications panel, via PawnIO'
)

try {
    Start-ConsoleStep 'CPU'
    $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
    $vendor = Get-CpuVendor $cpu
    $module = if ($vendor -eq 'Intel') { 'IntelMSR.bin' } else { 'AMDFamily17.bin' }
    Complete-ConsoleStep -Detail "$($cpu.Name.Trim()), $vendor module"

    Start-ConsoleStep 'Downloads'
    $pawnIoDir = Find-PawnIoDir
    $pawnIoSetup = $null
    if (-not $pawnIoDir) {
        $pawnIoSetup = Get-VerifiedDownload $PawnIoSetupUrl $PawnIoSetupSha256
    }
    $modules = Get-VerifiedDownload $ModulesUrl $ModulesSha256
    Complete-ConsoleStep -Detail 'SHA-256 verified'

    Start-ConsoleStep 'Sensor folder'
    Stop-SensorTask
    Remove-OldSensorTask
    New-SensorDir
    Complete-ConsoleStep -Detail "$SensorDir, writable by administrators and SYSTEM only"

    if ($pawnIoDir) {
        Write-ConsoleStep -Label 'PawnIO' -Detail "already installed in $pawnIoDir"
    } else {
        Start-ConsoleStep 'PawnIO'
        try {
            $pawnIoDir = Install-PawnIo $pawnIoSetup
        } catch {
            Uninstall-Sensor
            throw
        }
        Complete-ConsoleStep -Detail "installed in $pawnIoDir"
    }

    Start-ConsoleStep 'Module and loop'
    Save-Module $modules $module
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'hardware-sensors\sensor-loop.ps1') -Destination $LoopScript -Force
    Complete-ConsoleStep -Detail "$module, sensor-loop.ps1"

    Start-ConsoleStep 'Task'
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument ("-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$LoopScript`" " +
            "-PawnIoDir `"$pawnIoDir`" -Vendor $vendor -TctlOffset $(Get-TctlOffset $cpu.Name)")
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) `
        -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
        -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
        -Principal $principal -Settings $settings -Force | Out-Null
    Start-ScheduledTask -TaskName $TaskName
    Complete-ConsoleStep -Detail "'$TaskName', runs as SYSTEM from startup"

    Start-ConsoleStep 'First readings'
    $reading = Wait-FirstReading
    if (-not $reading) {
        $failure = Get-LastFailure
        Uninstall-Sensor
        Complete-ConsoleStep -Status fail -Detail "nothing within $FirstReadingTimeoutSeconds s"
        foreach ($line in $failure -split "`n") { Write-ConsoleNote $line.TrimEnd() warn }
        throw 'PawnIO reported nothing, so nothing was installed.'
    }
    Add-Reading 'CPU temperature' $reading.cpu_temperature_celsius 'Celsius'
    Add-Reading 'CPU package power' $reading.cpu_power_watts 'W'
    if (Test-Path -LiteralPath $ErrorFile) {
        foreach ($line in (Get-LastFailure) -split "`n") { Add-ConsoleNote $line.TrimEnd() warn }
        Complete-ConsoleStep -Status warn -Detail 'some readings failed'
    } else {
        Complete-ConsoleStep
    }
} catch {
    Write-ConsoleFailure ('Install failed: {0}' -f $_.Exception.Message)
    exit 1
}

Write-ConsoleResult 'The hardware sensors are installed.' -Lines @(
    "$ReadingFile updates every second; DataForge shows it in the system specifications panel.",
    'Remove them with: scripts\install-hardware-sensors.bat -Uninstall'
)
