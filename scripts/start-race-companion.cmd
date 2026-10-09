@echo off
setlocal EnableExtensions

if /I "%~1"=="server" goto server

set "REPO_DIR=C:\Users\Yasin\Desktop\DeskHub"
set "APP_DIR=%REPO_DIR%\deskhub"
set "DASHBOARD_URL=http://127.0.0.1:8787/race"

title DeskHub Race Companion Launcher

if not exist "%APP_DIR%\package.json" (
  echo [DeskHub] ERROR: Application directory was not found:
  echo %APP_DIR%
  goto failure
)

call :health_check
if not errorlevel 1 (
  echo [DeskHub] Race Companion is already running. Opening dashboard...
  start "" "%DASHBOARD_URL%"
  exit /b 0
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo [DeskHub] ERROR: npm.cmd was not found in PATH.
  echo Install Node.js or make sure its installation directory is in PATH.
  goto failure
)

echo [DeskHub] Starting Race Companion...
start "DeskHub Race Companion" /D "%APP_DIR%" "%ComSpec%" /k call "%~f0" server

set /a ATTEMPT=0
:wait_for_server
call :health_check
if not errorlevel 1 goto ready

set /a ATTEMPT+=1
if %ATTEMPT% GEQ 30 goto startup_timeout
timeout /t 1 /nobreak >nul
goto wait_for_server

:ready
echo [DeskHub] Server is ready. Opening dashboard...
start "" "%DASHBOARD_URL%"
exit /b 0

:startup_timeout
echo.
echo [DeskHub] ERROR: Server did not become ready within 30 seconds.
echo Review the "DeskHub Race Companion" window for the startup error.
goto failure

:health_check
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { $result = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/health' -TimeoutSec 1; if ($result.ok -eq $true) { exit 0 } } catch {}; exit 1" >nul 2>&1
exit /b %errorlevel%

:server
title DeskHub Race Companion
cd /d "C:\Users\Yasin\Desktop\DeskHub\deskhub"
if errorlevel 1 (
  echo [DeskHub] ERROR: Could not enter the application directory.
  goto server_failure
)

set "DESKHUB_DISPLAY=none"
set "RACE_COMPANION_HOST=0.0.0.0"
set "RACE_COMPANION_PORT=8787"

echo [DeskHub] Display: none
echo [DeskHub] Dashboard: http://127.0.0.1:8787/race
echo [DeskHub] Press Ctrl+C to stop.
echo.

npm.cmd run iracing
if errorlevel 1 goto server_failure
exit /b 0

:server_failure
echo.
echo [DeskHub] Race Companion stopped or failed to start.
echo Check the error output above before closing this window.
pause
exit /b 1

:failure
echo.
pause
exit /b 1
