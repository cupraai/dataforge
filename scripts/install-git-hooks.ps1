# Installs the tracked git hooks for this repository. Twin: install-git-hooks.sh.
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'console.ps1')

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-ConsoleTitle 'DataForge git hooks'

git config core.hooksPath .githooks
if ($LASTEXITCODE -ne 0) {
    Write-ConsoleStep -Label 'Hooks' -Status fail -Detail 'git config core.hooksPath failed'
    exit 1
}
Write-ConsoleStep -Label 'Hooks' -Detail 'installed from .githooks\'
Write-ConsoleNote 'pre-commit   auto-fixes lint and formatting, runs the lint-only checks, bumps the version'

$missing = @()
if (-not (Test-Path 'backend\.venv')) {
    $missing += 'backend: backend\.venv\Scripts\pip install -r backend\requirements.txt -r backend\requirements-dev.txt'
}
if (-not (Test-Path 'frontend\node_modules')) { $missing += 'frontend: cd frontend; npm ci' }
if ($missing.Count -gt 0) {
    Write-ConsoleStep -Label 'Dependencies' -Status warn -Detail 'the hooks need these first; setup.bat installs both'
    foreach ($line in $missing) { Write-ConsoleNote $line }
} else {
    Write-ConsoleStep -Label 'Dependencies' -Detail 'backend\.venv and frontend\node_modules present'
}
