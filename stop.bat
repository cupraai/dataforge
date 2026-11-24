@echo off
:: Frees the DataForge ports when a server outlived its launcher.
:: Thin shim, so the script lives in one place (stop.ps1).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop.ps1" %*
set "ERR=%ERRORLEVEL%"
echo.
echo Press any key to close this window...
pause >nul
exit /b %ERR%
