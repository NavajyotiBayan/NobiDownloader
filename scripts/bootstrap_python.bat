@echo off
setlocal EnableExtensions
cd /d "%~dp0.."

set "ROOT=%~dp0.."
if "%NOBI_DATA_ROOT%"=="" set "NOBI_DATA_ROOT=%ROOT%"
set "DATA_ROOT=%NOBI_DATA_ROOT%"
set "PYDIR=%DATA_ROOT%\runtime\python"
set "ZIP=%DATA_ROOT%\runtime\python-embed.zip"
set "GETPIP=%DATA_ROOT%\runtime\get-pip.py"

rem Ensure the parent runtime directory exists before downloading files into it.
if not exist "%DATA_ROOT%\runtime" mkdir "%DATA_ROOT%\runtime"

if exist "%PYDIR%\python.exe" exit /b 0

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip' -OutFile '%ZIP%'"
if errorlevel 1 exit /b 1

if not exist "%PYDIR%" mkdir "%PYDIR%"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Expand-Archive -LiteralPath '%ZIP%' -DestinationPath '%PYDIR%' -Force"
if errorlevel 1 exit /b 1

rem Enable site-packages support in the embeddable distribution.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$f=Get-ChildItem '%PYDIR%\python*._pth' | Select-Object -First 1; (Get-Content $f.FullName) -replace '#import site','import site' | Set-Content $f.FullName"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile '%GETPIP%'"
if errorlevel 1 exit /b 1

"%PYDIR%\python.exe" "%GETPIP%" --disable-pip-version-check
if errorlevel 1 exit /b 1

del /q "%ZIP%" "%GETPIP%" 2>nul
exit /b 0
