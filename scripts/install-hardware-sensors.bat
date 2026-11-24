@echo off
:: Right-click and choose "Run as administrator"; pass -Uninstall to remove.
:: Thin shim, so the default execution policy does not block the script.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-hardware-sensors.ps1" %*
set "ERR=%ERRORLEVEL%"
echo.
echo Press any key to close this window...
pause >nul
exit /b %ERR%
