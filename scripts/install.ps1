# NobiDownloader Windows installer
$ErrorActionPreference = "Stop"

$Repo = "https://github.com/NavajyotiBayan/NobiDownloader"
$Api = "https://api.github.com/repos/NavajyotiBayan/NobiDownloader/releases/latest"
$Desktop = [Environment]::GetFolderPath("Desktop")
$InstallDir = Join-Path $Desktop "NobiDownloader"

# Primary path: GitHub's stable "latest release asset" redirect.
# Keep the release asset filename stable across V1 releases.
$DirectUrl = "https://github.com/NavajyotiBayan/NobiDownloader/releases/latest/download/NobiDownloader-V1-Beta.zip"

$tmp = Join-Path $env:TEMP "NobiDownloader-latest.zip"
$extract = Join-Path $env:TEMP "NobiDownloader-install"

if (Test-Path $extract) {
    Remove-Item $extract -Recurse -Force
}
New-Item -ItemType Directory $extract -Force | Out-Null

$downloaded = $false

try {
    Write-Host "Downloading the latest NobiDownloader release..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $DirectUrl -OutFile $tmp -MaximumRedirection 10
    if ((Test-Path $tmp) -and ((Get-Item $tmp).Length -gt 1000)) {
        $downloaded = $true
    }
}
catch {
    $downloaded = $false
}

# Fallback: query the GitHub Releases API and select the first ZIP asset.
if (-not $downloaded) {
    Write-Host "Direct release download was unavailable. Checking GitHub Releases API..." -ForegroundColor Yellow

    $release = Invoke-RestMethod `
        -Uri $Api `
        -Headers @{
            "User-Agent" = "NobiDownloader-Installer"
            "Accept"     = "application/vnd.github+json"
        }

    $asset = $release.assets |
        Where-Object { $_.name -match '\.zip$' } |
        Select-Object -First 1

    if (-not $asset) {
        throw "No ZIP release asset found. Please make sure the latest GitHub release contains a .zip asset."
    }

    Invoke-WebRequest `
        -Uri $asset.browser_download_url `
        -OutFile $tmp `
        -MaximumRedirection 10

    $downloaded = $true
}

if (-not $downloaded -or -not (Test-Path $tmp)) {
    throw "Unable to download the NobiDownloader release ZIP."
}

Expand-Archive $tmp -DestinationPath $extract -Force

if (Test-Path $InstallDir) {
    $backup = "$InstallDir.backup"
    if (Test-Path $backup) {
        Remove-Item $backup -Recurse -Force
    }
    Rename-Item $InstallDir $backup
}

New-Item -ItemType Directory $InstallDir -Force | Out-Null

$root = Get-ChildItem $extract -Directory | Select-Object -First 1
if ($root) {
    Get-ChildItem $root.FullName | Copy-Item -Destination $InstallDir -Recurse -Force
}
else {
    Get-ChildItem $extract | Copy-Item -Destination $InstallDir -Recurse -Force
}

New-Item -ItemType Directory (Join-Path $InstallDir "downloads") -Force | Out-Null

Remove-Item $tmp -Force -ErrorAction SilentlyContinue
Remove-Item $extract -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "NobiDownloader installed successfully." -ForegroundColor Green
Write-Host "Location: $InstallDir" -ForegroundColor Cyan
Write-Host "Run Start.bat from the NobiDownloader folder." -ForegroundColor Cyan
