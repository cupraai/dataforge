@echo off
:: Thin shim so the updater lives in exactly one place (update.ps1).
:: Requires Git on PATH and a Git clone of DataForge.
title DataForge Update
:: cmd reads a batch file as it runs, and the pull may rewrite this one. One command, the
:: if block included, is parsed whole before it runs, and every branch of it exits.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1" %* & if errorlevel 1 (
  echo.
  pause
  exit /b 1
) else (
  echo.
  echo Press any key to close this window...
  pause >nul
  exit /b 0
)
