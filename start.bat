@echo off
:: Production launcher: builds the UI, then serves everything from one process.
:: Thin shim, so the launcher lives in one place (start.ps1). Flags pass through: start.bat -Rebuild
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
if errorlevel 1 (
  echo Press any key to close this window...
  pause >nul
  exit /b 1
)
