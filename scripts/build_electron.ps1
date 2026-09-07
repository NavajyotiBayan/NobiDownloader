$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host 'Installing npm dependencies without lifecycle scripts...' -ForegroundColor Cyan
npm install --no-audit --no-fund --ignore-scripts
if ($LASTEXITCODE -ne 0) {
    throw "npm install failed with exit code $LASTEXITCODE"
}

# Electron's npm lifecycle script is intentionally skipped because some npm
# configurations block install scripts. electron-builder will download the
# exact Electron runtime declared in package.json during packaging.
Write-Host 'Building Windows NSIS installer and portable EXE...' -ForegroundColor Cyan
npx electron-builder --win nsis portable --publish never
if ($LASTEXITCODE -ne 0) {
    throw "electron-builder failed with exit code $LASTEXITCODE"
}

$setup = Join-Path $PWD 'release\NobiDownloader-2.0.0-Setup.exe'
$portable = Join-Path $PWD 'release\NobiDownloader-2.0.0-Portable.exe'
if (-not (Test-Path $setup)) { throw 'NSIS installer was not created.' }
if (-not (Test-Path $portable)) { throw 'Portable EXE was not created.' }

Write-Host ''
Write-Host 'Build complete.' -ForegroundColor Green
Write-Host "Installer: $setup"
Write-Host "Portable:  $portable"
