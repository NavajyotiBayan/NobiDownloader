# NobiDownloader Windows installer
$ErrorActionPreference = "Stop"
$Repo = "https://github.com/NavajyotiBayan/NobiDownloader"
$Desktop = [Environment]::GetFolderPath("Desktop")
$InstallDir = Join-Path $Desktop "NobiDownloader"
$Api = "https://api.github.com/repos/NavajyotiBayan/NobiDownloader/releases/latest"

$release = Invoke-RestMethod `
    -Uri $Api `
    -Headers @{
        "User-Agent" = "NobiDownloader-Installer"
        "Accept"     = "application/vnd.github+json"
    }
$asset = $release.assets | Where-Object {$_.name -match '\.zip$'} | Select-Object -First 1
if (-not $asset) { throw "No ZIP release asset found." }
$tmp = Join-Path $env:TEMP "NobiDownloader-latest.zip"
$extract = Join-Path $env:TEMP "NobiDownloader-install"
if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
New-Item -ItemType Directory $extract | Out-Null
Write-Host "Downloading NobiDownloader $($release.tag_name)..." -ForegroundColor Cyan
Invoke-WebRequest $asset.browser_download_url -OutFile $tmp
Expand-Archive $tmp -DestinationPath $extract -Force
if (Test-Path $InstallDir) {
    $backup="$InstallDir.backup"
    if(Test-Path $backup){Remove-Item $backup -Recurse -Force}
    Rename-Item $InstallDir $backup
}
New-Item -ItemType Directory $InstallDir | Out-Null
$root=Get-ChildItem $extract -Directory | Select-Object -First 1
if($root){Get-ChildItem $root.FullName | Copy-Item -Destination $InstallDir -Recurse -Force}
else{Get-ChildItem $extract | Copy-Item -Destination $InstallDir -Recurse -Force}
New-Item -ItemType Directory (Join-Path $InstallDir "downloads") -Force | Out-Null
Remove-Item $tmp,$extract -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Installed to $InstallDir" -ForegroundColor Green
Write-Host "Run the NobiDownloader BAT launcher from that folder."
