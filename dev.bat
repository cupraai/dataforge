@echo off
:: Development launcher: hot reload, two servers. For production, use start.bat.
:: Thin shim, so the launcher lives in one place (dev.ps1). Flags pass through: dev.bat -NoReload
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev.ps1" %*
if errorlevel 1 (
  echo Press any key to close this window...
  pause >nul
  exit /b 1
)
