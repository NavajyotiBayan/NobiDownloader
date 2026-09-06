# NobiDownloader updater
$ErrorActionPreference = "Stop"

$Repo = "https://github.com/NavajyotiBayan/NobiDownloader"
$Api = "https://api.github.com/repos/NavajyotiBayan/NobiDownloader/releases/latest"
$InstallDir = Join-Path ([Environment]::GetFolderPath("Desktop")) "NobiDownloader"

if (-not (Test-Path $InstallDir)) {
    throw "NobiDownloader is not installed. Run install.ps1 first."
}

$release = Invoke-RestMethod `
    -Uri $Api `
    -Headers @{
        "User-Agent" = "NobiDownloader-Updater"
        "Accept"     = "application/vnd.github+json"
    }

$asset = $release.assets |
    Where-Object { $_.name -match '\.zip$' } |
    Select-Object -First 1

if (-not $asset) {
    throw "No ZIP release asset found in the latest GitHub release ($($release.tag_name))."
}

$tmp = Join-Path $env:TEMP "NobiDownloader-update.zip"
$extract = Join-Path $env:TEMP "NobiDownloader-update"

if (Test-Path $extract) {
    Remove-Item $extract -Recurse -Force
}

New-Item -ItemType Directory $extract -Force | Out-Null

Write-Host "Downloading NobiDownloader $($release.tag_name)..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $tmp

Expand-Archive $tmp -DestinationPath $extract -Force

$backup = "$InstallDir.backup"
if (Test-Path $backup) {
    Remove-Item $backup -Recurse -Force
}

Rename-Item $InstallDir $backup
New-Item -ItemType Directory $InstallDir -Force | Out-Null

$root = Get-ChildItem $extract -Directory | Select-Object -First 1
if ($root) {
    Get-ChildItem $root.FullName | Copy-Item -Destination $InstallDir -Recurse -Force
}
else {
    Get-ChildItem $extract | Copy-Item -Destination $InstallDir -Recurse -Force
}

# Preserve the user's existing downloads folder when possible.
$oldDownloads = Join-Path $backup "downloads"
$newDownloads = Join-Path $InstallDir "downloads"

if (Test-Path $oldDownloads) {
    if (Test-Path $newDownloads) {
        Remove-Item $newDownloads -Recurse -Force
    }
    Copy-Item $oldDownloads $newDownloads -Recurse -Force
}
else {
    New-Item -ItemType Directory $newDownloads -Force | Out-Null
}

Remove-Item $tmp, $extract -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "NobiDownloader $($release.tag_name) updated successfully." -ForegroundColor Green
Write-Host "Installed at: $InstallDir" -ForegroundColor Cyan
