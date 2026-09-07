$ErrorActionPreference = 'Stop'

$repo = 'NavajyotiBayan/NobiDownloader'
$api  = "https://api.github.com/repos/$repo/releases/latest"

Write-Host "Installing NobiDownloader..." -ForegroundColor Green

$release = Invoke-RestMethod `
    -Uri $api `
    -Headers @{ 'User-Agent' = 'NobiDownloader-Installer' }

$asset = $release.assets |
    Where-Object {
        $_.name -like 'NobiDownloader-*-Setup.exe'
    } |
    Select-Object -First 1

if (-not $asset) {
    throw 'NobiDownloader installer was not found in the latest GitHub Release.'
}

$tempInstaller = Join-Path $env:TEMP $asset.name

Write-Host "Downloading $($asset.name)..."

Invoke-WebRequest `
    -Uri $asset.browser_download_url `
    -OutFile $tempInstaller

Write-Host "Starting installer..."

Start-Process `
    -FilePath $tempInstaller `
    -Wait

Remove-Item $tempInstaller -Force -ErrorAction SilentlyContinue

Write-Host "NobiDownloader installation complete." -ForegroundColor Green