@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Local Media Downloader - V1 Beta
cd /d "%~dp0"

echo.
echo ================================================================
echo              NOBIDOWNLOADER - V1 BETA
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

rem IMPORTANT: server.py defines the FastAPI app; uvicorn must launch app:app.
start "Local Media Server" /b cmd /c ^
  ""%PY%" -m uvicorn backend.server:app --app-dir "%APP%" --host 127.0.0.1 --port %PORT% --log-level info > "%LOG%" 2>&1"

echo       Waiting for server...

set "READY="
for /L %%N in (1,1,30) do (
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
      "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 'http://127.0.0.1:%PORT%/api/health'; if($r.StatusCode -eq 200){exit 0}else{exit 1} } catch { exit 1 }"
    if not errorlevel 1 (
        set "READY=1"
        goto :server_ready
    )
    timeout /t 1 /nobreak >nul
)

:server_ready
if not defined READY (
    echo.
    echo ERROR: The local server did not start.
    echo.
    echo ---- server.log ----
    type "%LOG%"
    echo --------------------
    goto :error
)

echo [6/6] Opening web app...
start "" "http://127.0.0.1:%PORT%/"
echo.
echo ================================================================
echo                  LOCAL MEDIA - READY
echo ================================================================
echo.
echo  Web app : http://127.0.0.1:%PORT%/
echo  Logs    : %LOG%
echo.
echo  Keep this window open while using the app.
echo  Press CTRL+C here to stop the server.
echo ================================================================
echo.

:monitor
timeout /t 2 /nobreak >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 'http://127.0.0.1:%PORT%/api/health'; if($r.StatusCode -ne 200){exit 1}else{exit 0} } catch { exit 1 }"
if errorlevel 1 (
    echo.
    echo Server stopped unexpectedly.
    echo Check: %LOG%
    echo.
    type "%LOG%"
    pause
    exit /b 1
)
goto :monitor

:error
echo.
echo ================================================================
echo ERROR: V1 Beta could not start.
echo ================================================================
echo.
echo See: %LOG%
pause
exit /b 1
