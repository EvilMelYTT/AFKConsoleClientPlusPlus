@echo off
setlocal EnableDelayedExpansion

cd /d "%~dp0"
title AFK Console Client
set "INSTALLED_DEPS=0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not on PATH.
  echo Install Node.js LTS from https://nodejs.org and try again.
  echo.
  pause
  exit /b 1
)

if not exist "config.json" (
  echo [ERROR] config.json is missing.
  echo.
  pause
  exit /b 1
)

if not exist "usernames.txt" (
  echo [ERROR] usernames.txt is missing.
  echo.
  pause
  exit /b 1
)

node -e "require('mineflayer')" >nul 2>nul
if errorlevel 1 (
  echo [INFO] Dependencies missing. Installing now...
  echo.
  call :installDeps
  if errorlevel 1 (
    echo.
    echo [ERROR] Dependency install failed.
    echo [ERROR] Your Node install likely has no working npm.
    echo [ERROR] Reinstall Node.js LTS from https://nodejs.org
    echo.
    pause
    exit /b 1
  )
  set "INSTALLED_DEPS=1"
)

if "%INSTALLED_DEPS%"=="1" (
  echo.
  echo [INFO] Dependencies installed successfully.
  pause
  cls
)

title AFK Console Client
echo [INFO] Starting client...
echo.
node "src\index.js"

echo.
echo [INFO] Client stopped.
pause
exit /b 0

:installDeps
where npm >nul 2>nul
if not errorlevel 1 (
  call npm --version >nul 2>nul
  if not errorlevel 1 (
    call npm install
    if not errorlevel 1 exit /b 0
  )
)

if exist "%ProgramFiles%\nodejs\npm.cmd" (
  call "%ProgramFiles%\nodejs\npm.cmd" install
  if not errorlevel 1 exit /b 0
)
if exist "%ProgramFiles(x86)%\nodejs\npm.cmd" (
  call "%ProgramFiles(x86)%\nodejs\npm.cmd" install
  if not errorlevel 1 exit /b 0
)

if exist "%ProgramFiles%\nodejs\node.exe" if exist "%ProgramFiles%\nodejs\node_modules\npm\bin\npm-cli.js" (
  "%ProgramFiles%\nodejs\node.exe" "%ProgramFiles%\nodejs\node_modules\npm\bin\npm-cli.js" install
  if not errorlevel 1 exit /b 0
)
if exist "%ProgramFiles(x86)%\nodejs\node.exe" if exist "%ProgramFiles(x86)%\nodejs\node_modules\npm\bin\npm-cli.js" (
  "%ProgramFiles(x86)%\nodejs\node.exe" "%ProgramFiles(x86)%\nodejs\node_modules\npm\bin\npm-cli.js" install
  if not errorlevel 1 exit /b 0
)

if exist "%ProgramFiles%\nodejs\corepack.cmd" (
  call "%ProgramFiles%\nodejs\corepack.cmd" npm install
  if not errorlevel 1 exit /b 0
)
if exist "%ProgramFiles(x86)%\nodejs\corepack.cmd" (
  call "%ProgramFiles(x86)%\nodejs\corepack.cmd" npm install
  if not errorlevel 1 exit /b 0
)

exit /b 1
