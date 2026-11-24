<#
.SYNOPSIS
  Writes CPU temperature and CPU package power next to this script every second,
  as sensors.json. Installed and run as SYSTEM by install-hardware-sensors.ps1.

.PARAMETER PawnIoDir
  The PawnIO installation holding PawnIOLib.dll.

.PARAMETER Vendor
  Picks the CPU's PawnIO module next to this script and how to read it.

.PARAMETER TctlOffset
  Degrees that some Ryzen models report above the real die temperature.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $PawnIoDir,
    [Parameter(Mandatory)] [ValidateSet('Intel', 'AMD')] [string] $Vendor,
    [double] $TctlOffset = 0
)

$ErrorActionPreference = 'Stop'

$OutputFile = Join-Path $PSScriptRoot 'sensors.json'
$PendingFile = Join-Path $PSScriptRoot 'sensors.pending'
$ErrorFile = Join-Path $PSScriptRoot 'sensors.error'
$CpuModuleFile = Join-Path $PSScriptRoot $(if ($Vendor -eq 'Intel') { 'IntelMSR.bin' } else { 'AMDFamily17.bin' })
$IntervalMilliseconds = 1000
$RetryMilliseconds = 500
$MaxRetryMilliseconds = 30000
# Other hardware software was measured holding the bus for about 160 ms at a time.
$BusMutexTimeoutMilliseconds = 1000
$MaxPlausibleCelsius = 125
$MaxPlausibleWatts = 1000
$IntelTemperatureTarget = 0x1A2
$IntelPackageThermStatus = 0x1B1
$IntelPowerUnit = 0x606
$IntelPackageEnergy = 0x611
$AmdThermalControl = 0x59800
# Without the L, PowerShell reads a hex literal above 0x7FFFFFFF as a negative Int32.
$AmdPowerUnit = 0xC0010299L
$AmdPackageEnergy = 0xC001029BL

Add-Type -Namespace DataForge -Name PawnIo -MemberDefinition @'
[DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
public static extern bool SetDllDirectoryW(string path);

[DllImport("PawnIOLib.dll")]
public static extern int pawnio_open(out IntPtr handle);

[DllImport("PawnIOLib.dll")]
public static extern int pawnio_load(IntPtr handle, byte[] blob, UIntPtr size);

[DllImport("PawnIOLib.dll", CharSet = CharSet.Ansi)]
public static extern int pawnio_execute(
  IntPtr handle, string name, ulong[] input, UIntPtr inputCells,
  ulong[] output, UIntPtr outputCells, out UIntPtr returnedCells);

[DllImport("PawnIOLib.dll")]
public static extern int pawnio_close(IntPtr handle);
'@

function Assert-Success([int] $Result, [string] $Action) {
    if ($Result -lt 0) {
        throw ('{0} failed with 0x{1:X8}.' -f $Action, $Result)
    }
}

function Close-Module([IntPtr] $Handle) {
    if ($Handle -ne [IntPtr]::Zero) {
        [void][DataForge.PawnIo]::pawnio_close($Handle)
    }
}

function Open-Module([string] $ModuleFile) {
    $handle = [IntPtr]::Zero
    Assert-Success ([DataForge.PawnIo]::pawnio_open([ref]$handle)) 'Opening PawnIO'
    try {
        $module = [IO.File]::ReadAllBytes($ModuleFile)
        Assert-Success ([DataForge.PawnIo]::pawnio_load($handle, $module, [UIntPtr][uint64]$module.Length)) `
            "Loading $(Split-Path -Leaf $ModuleFile)"
    } catch {
        Close-Module $handle
        throw
    }
    $handle
}

function Invoke-Module([IntPtr] $Handle, [string] $Function, [uint64[]] $Arguments, [int] $OutputCells) {
    $output = [uint64[]]::new([Math]::Max($OutputCells, 1))
    $returned = [UIntPtr]::Zero
    Assert-Success ([DataForge.PawnIo]::pawnio_execute(
            $Handle, $Function, $Arguments, [UIntPtr][uint64]$Arguments.Length,
            $output, [UIntPtr][uint64]$OutputCells, [ref]$returned)) $Function
    $output[0]
}

function Read-Register([IntPtr] $Handle, [string] $Function, [uint64] $Address) {
    Invoke-Module $Handle $Function @($Address) 1
}

function ConvertTo-IntelCelsius([uint64] $TemperatureTarget, [uint64] $ThermStatus) {
    if (-not ($ThermStatus -band 0x80000000L)) {
        throw 'The CPU marked its temperature reading as invalid.'
    }
    $tjMax = ($TemperatureTarget -shr 16) -band 0xFF
    $degreesBelowTjMax = ($ThermStatus -shr 16) -band 0x7F
    [double]($tjMax - $degreesBelowTjMax)
}

function ConvertTo-AmdCelsius([uint64] $ThermalControl, [double] $Offset) {
    $celsius = (($ThermalControl -shr 21) -band 0x7FF) * 0.125
    # Bit 19, or both of bits 17:16, select the range that starts at -49 Celsius.
    if (($ThermalControl -band 0x80000) -or (($ThermalControl -band 0x30000) -eq 0x30000)) {
        $celsius -= 49
    }
    $celsius - $Offset
}

function ConvertTo-JoulesPerCount([uint64] $PowerUnit) {
    # Both vendors keep the energy status unit in bits 12:8, as a power of one half.
    1.0 / [Math]::Pow(2, ($PowerUnit -shr 8) -band 0x1F)
}

function ConvertTo-Watts([uint64] $PreviousCount, [uint64] $Count, [double] $JoulesPerCount, [double] $Seconds) {
    # The energy counter is 32 bits wide and wraps within minutes under load.
    $delta = [long]($Count -band 0xFFFFFFFFL) - [long]($PreviousCount -band 0xFFFFFFFFL)
    if ($delta -lt 0) {
        $delta += 0x100000000L
    }
    $delta * $JoulesPerCount / $Seconds
}

function New-SharedMutex([string] $Name) {
    # Every hardware monitor shares this name, so unelevated ones must open it too.
    $everyone = New-Object Security.Principal.SecurityIdentifier(
        [Security.Principal.WellKnownSidType]::WorldSid, $null)
    $security = New-Object Security.AccessControl.MutexSecurity
    $security.AddAccessRule((New-Object Security.AccessControl.MutexAccessRule(
                $everyone, [Security.AccessControl.MutexRights]::FullControl, 'Allow')))
    $created = $false
    New-Object Threading.Mutex($false, $Name, [ref]$created, $security)
}

function Invoke-WithMutex([Threading.Mutex] $Mutex, [scriptblock] $Action) {
    try {
        if (-not $Mutex.WaitOne($BusMutexTimeoutMilliseconds)) {
            throw 'Another tool kept the bus busy.'
        }
    } catch [Threading.AbandonedMutexException] {
        # A holder that crashed still hands ownership over.
    }
    try {
        & $Action
    } finally {
        $Mutex.ReleaseMutex()
    }
}

function Read-Celsius([IntPtr] $Handle) {
    if ($Vendor -eq 'Intel') {
        return ConvertTo-IntelCelsius (Read-Register $Handle 'ioctl_read_msr' $IntelTemperatureTarget) `
            (Read-Register $Handle 'ioctl_read_msr' $IntelPackageThermStatus)
    }
    $thermalControl = Invoke-WithMutex $PciMutex { Read-Register $Handle 'ioctl_read_smn' $AmdThermalControl }
    ConvertTo-AmdCelsius $thermalControl $TctlOffset
}

function Read-PackageEnergy([IntPtr] $Handle) {
    $register = if ($Vendor -eq 'Intel') { $IntelPackageEnergy } else { $AmdPackageEnergy }
    Read-Register $Handle 'ioctl_read_msr' $register
}

function Read-JoulesPerCount([IntPtr] $Handle) {
    $register = if ($Vendor -eq 'Intel') { $IntelPowerUnit } else { $AmdPowerUnit }
    ConvertTo-JoulesPerCount (Read-Register $Handle 'ioctl_read_msr' $register)
}

function Format-Number($Value) {
    if ($null -eq $Value) {
        return 'null'
    }
    # This must not follow the system locale: German Windows would write 59,25.
    ([double]$Value).ToString('0.##', [Globalization.CultureInfo]::InvariantCulture)
}

function Format-Readings($Celsius, $Watts) {
    '{{"cpu_temperature_celsius":{0},"cpu_power_watts":{1}}}' -f (Format-Number $Celsius), (Format-Number $Watts)
}

function Publish-Readings([string] $Json) {
    [IO.File]::WriteAllText($PendingFile, $Json)
    Move-Item -Force -LiteralPath $PendingFile -Destination $OutputFile
}

function Get-NextDelay([int] $Failures) {
    if ($Failures -eq 0) {
        return $IntervalMilliseconds
    }
    [Math]::Min($RetryMilliseconds * [Math]::Pow(2, $Failures - 1), $MaxRetryMilliseconds)
}

[void][DataForge.PawnIo]::SetDllDirectoryW($PawnIoDir)
# Task Scheduler starts tasks below normal, which starved the readings under load.
[Diagnostics.Process]::GetCurrentProcess().PriorityClass = [Diagnostics.ProcessPriorityClass]::AboveNormal
if ($Vendor -eq 'AMD') {
    $PciMutex = New-SharedMutex 'Global\Access_PCI'
}

$cpuHandle = [IntPtr]::Zero
$joulesPerCount = $null
$previousEnergy = $null
$energyClock = [Diagnostics.Stopwatch]::new()
$failures = 0
while ($true) {
    $errors = @()
    $celsius = $null
    $watts = $null

    try {
        if ($cpuHandle -eq [IntPtr]::Zero) {
            $cpuHandle = Open-Module $CpuModuleFile
        }
        $celsius = Read-Celsius $cpuHandle
        if ($celsius -le 0 -or $celsius -gt $MaxPlausibleCelsius) {
            $errors += "Implausible temperature: $celsius Celsius."
            $celsius = $null
        }
        if ($null -eq $joulesPerCount) {
            $joulesPerCount = Read-JoulesPerCount $cpuHandle
        }
        $energy = Read-PackageEnergy $cpuHandle
        $seconds = $energyClock.Elapsed.TotalSeconds
        $energyClock.Restart()
        if ($null -ne $previousEnergy -and $seconds -gt 0) {
            $watts = ConvertTo-Watts $previousEnergy $energy $joulesPerCount $seconds
            if ($watts -lt 0 -or $watts -gt $MaxPlausibleWatts) {
                $errors += "Implausible package power: $watts W."
                $watts = $null
            }
        }
        $previousEnergy = $energy
    } catch {
        $errors += "CPU: $($_.Exception.Message)"
        Close-Module $cpuHandle
        $cpuHandle = [IntPtr]::Zero
        $previousEnergy = $null
    }

    $anyReading = ($null -ne $celsius) -or ($null -ne $watts)
    try {
        if ($anyReading) {
            Publish-Readings (Format-Readings $celsius $watts)
        }
        if ($errors) {
            # The backend may hold the file open mid-read; the next round replaces it.
            Set-Content -LiteralPath $ErrorFile -Value ($errors -join "`n") -ErrorAction SilentlyContinue
        } elseif (Test-Path -LiteralPath $ErrorFile) {
            Remove-Item -LiteralPath $ErrorFile -Force -ErrorAction SilentlyContinue
        }
    } catch {
        $anyReading = $false
    }

    # The first round has no power figure yet, so a temperature alone counts as working.
    $failures = if ($anyReading -or $null -ne $previousEnergy) { 0 } else { [Math]::Min($failures + 1, 16) }
    Start-Sleep -Milliseconds (Get-NextDelay $failures)
}
