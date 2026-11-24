@echo off
:: Installs everything into this folder; needs no Python and no Node/npm on the machine.
:: Thin shim, so the setup lives in one place (setup.ps1). Flags pass through: setup.bat -SkipTagging
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" %*
set "ERR=%ERRORLEVEL%"
echo.
echo Press any key to close this window...
pause >nul
exit /b %ERR%
