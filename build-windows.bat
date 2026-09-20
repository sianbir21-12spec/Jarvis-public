@echo off
REM ===================================================================
REM  JARVIS - Windows build
REM  Produces:
REM    release\JARVIS-0.1.0-win-x64.exe            (NSIS installer)
REM    release\JARVIS-0.1.0-portable.exe           (single-file portable)
REM  Run this from a normal Command Prompt in the project folder.
REM ===================================================================

setlocal
cd /d "%~dp0"

echo.
echo [1/4] Checking Node.js...
where node >nul 2>nul
if errorlevel 1 (
  echo   ERROR: Node.js was not found on PATH.
  echo   Install Node.js 20 or newer from https://nodejs.org and re-run.
  pause
  exit /b 1
)
node --version

echo.
echo [2/4] Installing dependencies...
REM npm ci needs a matching lockfile; fall back to npm install if it fails.
call npm ci
if errorlevel 1 (
  echo   npm ci failed, falling back to npm install...
  call npm install
  if errorlevel 1 goto :fail
)

echo.
echo [3/4] Type-checking and building frontend + server...
call npx tsc --noEmit
if errorlevel 1 (
  echo   ERROR: TypeScript reported errors. Fix them before packaging.
  goto :fail
)
call npm run build
if errorlevel 1 goto :fail

echo.
echo [4/4] Packaging Windows executables...
call npx electron-builder --win --x64
if errorlevel 1 goto :fail

echo.
echo ============================================
echo  BUILD COMPLETE
echo  Your executables are in the "release" folder:
dir /b release\*.exe
echo ============================================
pause
exit /b 0

:fail
echo.
echo BUILD FAILED. Scroll up for the first error message.
pause
exit /b 1
