@echo off
setlocal EnableExtensions
for %%I in ("%~dp0..") do set "REPO_DIR=%%~fI"
set "APP_DIR=%REPO_DIR%\deskhub"
set "DASHBOARD_URL=http://127.0.0.1:8787/race"
if /I "%~1"=="server" goto server
set "RACE_COMPANION_HOST=127.0.0.1"
if /I "%~1"=="lan" set "RACE_COMPANION_HOST=0.0.0.0"
title DeskHub Launcher
if not exist "%APP_DIR%\package.json" goto failure
call :health_check
if errorlevel 3 goto different_mode
if errorlevel 2 goto legacy_server
if not errorlevel 1 goto ready
where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo [DeskHub] npm.cmd not found. Install Node.js and try again.
  goto failure
)
start "DeskHub" /D "%APP_DIR%" "%ComSpec%" /k call "%~f0" server
set /a ATTEMPT=0
:wait_for_server
call :health_check
if errorlevel 3 goto different_mode
if errorlevel 2 goto legacy_server
if not errorlevel 1 goto ready
set /a ATTEMPT+=1
if %ATTEMPT% GEQ 30 (
  echo [DeskHub] Startup timed out. Check the DeskHub console.
  goto failure
)
timeout /t 1 /nobreak >nul
goto wait_for_server
:ready
echo [DeskHub] Opening Race Companion. Listen address: %RACE_COMPANION_HOST%
if /I "%RACE_COMPANION_HOST%"=="127.0.0.1" echo [DeskHub] Local access only. For iPad at home, stop this app and launch with the lan argument.
if /I "%RACE_COMPANION_HOST%"=="0.0.0.0" echo [DeskHub] iPad uses http://YOUR-PC-IP:8787/race on your trusted home network.
start "" "%DASHBOARD_URL%"
exit /b 0
:legacy_server
echo [DeskHub] An older Race Companion is using port 8787. Stop its console with Ctrl+C, then retry.
goto failure
:different_mode
echo [DeskHub] DeskHub is already running with a different network mode. Stop its console with Ctrl+C, then retry.
goto failure
:health_check
powershell.exe -NoProfile -Command "try { $r = Invoke-RestMethod 'http://127.0.0.1:8787/api/health' -TimeoutSec 1; if ($r.ok -eq $true -and $r.application -eq 'deskhub') { if ($r.host -eq $env:RACE_COMPANION_HOST) { exit 0 }; exit 3 }; exit 2 } catch { exit 1 }" >nul 2>&1
exit /b %errorlevel%
:server
cd /d "%APP_DIR%"
if errorlevel 1 goto failure
if not defined DESKHUB_DISPLAY set "DESKHUB_DISPLAY=pixoo"
if not defined RACE_COMPANION_HOST set "RACE_COMPANION_HOST=127.0.0.1"
if not defined RACE_COMPANION_PORT set "RACE_COMPANION_PORT=8787"
if /I "%DESKHUB_DISPLAY%"=="pixoo" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%REPO_DIR%\scripts\start-pixoo-bridge.ps1"
  if errorlevel 1 echo [Pixoo] Bridge failed to start. Dashboard will still run.
)
call npm.cmd run deskhub
if errorlevel 1 goto failure
exit /b 0
:failure
echo [DeskHub] Check the error above.
pause
exit /b 1
