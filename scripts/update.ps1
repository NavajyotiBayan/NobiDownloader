# NobiDownloader updater
$ErrorActionPreference = "Stop"
$Repo="https://github.com/NavajyotiBayan/NobiDownloader"
$InstallDir=Join-Path ([Environment]::GetFolderPath("Desktop")) "NobiDownloader"
if(-not(Test-Path $InstallDir)){throw "NobiDownloader is not installed. Run install.ps1 first."}
$release=Invoke-RestMethod -Uri "$Repo/releases/latest" -Headers @{"User-Agent"="NobiDownloader-Updater"}
$asset=$release.assets|Where-Object{$_.name -match '\.zip$'}|Select-Object -First 1
if(-not $asset){throw "No ZIP release asset found."}
$tmp=Join-Path $env:TEMP "NobiDownloader-update.zip"
$extract=Join-Path $env:TEMP "NobiDownloader-update"
if(Test-Path $extract){Remove-Item $extract -Recurse -Force}
New-Item -ItemType Directory $extract|Out-Null
Invoke-WebRequest $asset.browser_download_url -OutFile $tmp
Expand-Archive $tmp -DestinationPath $extract -Force
$backup="$InstallDir.backup"
if(Test-Path $backup){Remove-Item $backup -Recurse -Force}
Rename-Item $InstallDir $backup
New-Item -ItemType Directory $InstallDir|Out-Null
$root=Get-ChildItem $extract -Directory|Select-Object -First 1
if($root){Get-ChildItem $root.FullName|Copy-Item -Destination $InstallDir -Recurse -Force}
else{Get-ChildItem $extract|Copy-Item -Destination $InstallDir -Recurse -Force}
Remove-Item $tmp,$extract -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "NobiDownloader updated successfully." -ForegroundColor Green
