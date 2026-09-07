# NobiDownloader - one-line Windows installer
# Usage:
#   irm https://raw.githubusercontent.com/NavajyotiBayan/NobiDownloader/main/scripts/install.ps1 | iex

$ErrorActionPreference = 'Stop'
$Repo = 'NavajyotiBayan/NobiDownloader'
$Api = "https://api.github.com/repos/$Repo/releases/latest"
$TempDir = Join-Path $env:TEMP 'NobiDownloader-Installer'
$InstallerPath = Join-Path $TempDir 'NobiDownloader-Setup.exe'

if (-not $IsWindows -and $env:OS -ne 'Windows_NT') {
    throw 'NobiDownloader currently supports Windows only.'
}

if (Test-Path $TempDir) {
    Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

Write-Host 'NobiDownloader installer' -ForegroundColor Green
Write-Host 'Checking the latest GitHub release...' -ForegroundColor Cyan

$release = Invoke-RestMethod -Uri $Api -Headers @{
    'User-Agent' = 'NobiDownloader-Installer'
    'Accept' = 'application/vnd.github+json'
}

$asset = $release.assets |
    Where-Object { $_.name -match '^NobiDownloader-.*-Setup\.exe$' } |
    Select-Object -First 1

if (-not $asset) {
    throw 'No NobiDownloader Setup.exe was found in the latest GitHub release.'
}

Write-Host "Downloading $($asset.name)..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $InstallerPath -MaximumRedirection 10

if (-not (Test-Path $InstallerPath) -or (Get-Item $InstallerPath).Length -lt 1MB) {
    throw 'The installer download appears to be incomplete.'
}

Write-Host 'Starting NobiDownloader setup...' -ForegroundColor Cyan
Start-Process -FilePath $InstallerPath -Wait

Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue
Write-Host 'NobiDownloader installation finished.' -ForegroundColor Green
