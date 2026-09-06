@echo off
setlocal EnableExtensions
cd /d "%~dp0.."

set "ROOT=%~dp0.."
set "TOOLS=%ROOT%\tools"
set "ZIP=%TOOLS%\ffmpeg.zip"
set "TMP=%TOOLS%\ffmpeg_extract"

if exist "%TOOLS%\ffmpeg\bin\ffmpeg.exe" exit /b 0

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri 'https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip' -OutFile '%ZIP%'"
if errorlevel 1 exit /b 1

if exist "%TMP%" rmdir /s /q "%TMP%"
mkdir "%TMP%"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Expand-Archive -LiteralPath '%ZIP%' -DestinationPath '%TMP%' -Force"
if errorlevel 1 exit /b 1

for /d %%D in ("%TMP%\*") do (
    if exist "%%D\bin\ffmpeg.exe" (
        mkdir "%TOOLS%\ffmpeg" 2>nul
        xcopy "%%D\*" "%TOOLS%\ffmpeg\" /E /I /Y >nul
    )
)

rmdir /s /q "%TMP%" 2>nul
del /q "%ZIP%" 2>nul

if not exist "%TOOLS%\ffmpeg\bin\ffmpeg.exe" exit /b 1
exit /b 0
