@echo off
setlocal EnableExtensions EnableDelayedExpansion
title NobiDownloader - V1.1 Prototype
cd /d "%~dp0"

echo.
echo ================================================================
echo              NOBIDOWNLOADER - V1.1 BETA
echo ================================================================
echo.

set "ROOT=%~dp0"
set "RUNTIME=%ROOT%runtime"
set "PY=%RUNTIME%\python\python.exe"
set "TOOLS=%ROOT%tools"
set "YTDLP=%TOOLS%\yt-dlp.exe"
set "FFMPEG=%TOOLS%\ffmpeg\bin\ffmpeg.exe"
set "APP=%ROOT%app"
set "PORT=8765"
set "LOG=%ROOT%logs\server.log"

if not exist "%RUNTIME%" mkdir "%RUNTIME%"
if not exist "%TOOLS%" mkdir "%TOOLS%"
if not exist "%ROOT%downloads" mkdir "%ROOT%downloads"
if not exist "%ROOT%logs" mkdir "%ROOT%logs"

echo [1/6] Checking Python runtime...
if not exist "%PY%" (
    echo       Python runtime missing. Bootstrapping local runtime...
    call "%ROOT%scripts\bootstrap_python.bat"
    if errorlevel 1 goto :error
)
echo       OK

echo [2/6] Checking yt-dlp...
if not exist "%YTDLP%" (
    echo       yt-dlp missing. Downloading official executable...
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
      "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' -OutFile '%YTDLP%'"
    if errorlevel 1 goto :error
)
echo       OK

echo [3/6] Checking FFmpeg...
if not exist "%FFMPEG%" (
    echo       FFmpeg missing. Downloading official build...
    call "%ROOT%scripts\bootstrap_ffmpeg.bat"
    if errorlevel 1 goto :error
)
echo       OK

echo [4/6] Checking Python packages...
"%PY%" -m pip install -r "%APP%\requirements.txt" --disable-pip-version-check -q
if errorlevel 1 goto :error
echo       OK

echo [5/6] Starting local web server...
echo       http://127.0.0.1:%PORT%
echo.
echo       Starting server in this window...
echo       Closing this window will stop NobiDownloader.
echo.

rem Run the FastAPI/Uvicorn server in the SAME Python process as this
rem launcher. This prevents an orphaned server process. The server opens
rem the browser automatically after startup.
"%PY%" "%APP%\backend\server.py"

rem When the Python server exits, return to the launcher so the console
rem can close cleanly.
if errorlevel 1 goto :error
exit /b 0

:error
echo.
echo ================================================================
echo ERROR: NobiDownloader V1.1 could not start or was stopped.
echo ================================================================
echo.
echo See: %LOG%
pause
exit /b 1
