@echo off
setlocal
cd /d "%~dp0"
title Health Os

REM The installed and portable editions include their own runtime.
if exist "runtime\node.exe" (
  set "HEALTH_OS_NODE=%~dp0runtime\node.exe"
) else (
  REM A source checkout uses the developer's Node.js installation.
  where node.exe >nul 2>nul
  if errorlevel 1 (
    echo The Health Os runtime is missing. Reinstall Health Os.
    echo For a source checkout, install Node.js 24 or newer first.
    pause
    exit /b 1
  )
  set "HEALTH_OS_NODE=node.exe"
)

if exist "dist\client\index.html" goto launch
if not exist "src\client\index.html" (
  echo The compiled Health Os app is missing. Reinstall Health Os.
  pause
  exit /b 1
)

echo Preparing the source checkout...
if not exist "node_modules\vite\bin\vite.js" (
  call npm.cmd ci --ignore-scripts
  if errorlevel 1 goto setup_failed
)
call npm.cmd run build:client
if errorlevel 1 goto setup_failed

:launch
if not exist "scripts\launch-health-os.mjs" (
  echo The Health Os launcher is missing. Reinstall Health Os.
  pause
  exit /b 1
)
echo Opening Health Os...
"%HEALTH_OS_NODE%" "%~dp0scripts\launch-health-os.mjs"
if errorlevel 1 (
  echo Health Os could not start.
  echo Logs: %LOCALAPPDATA%\Health Os\logs\desktop.log
  pause
  exit /b 1
)
exit /b 0

:setup_failed
echo Source dependency installation or build failed. Review the errors above.
pause
exit /b 1
