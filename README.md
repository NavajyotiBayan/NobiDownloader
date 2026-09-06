# NobiDownloader

**Local Media Workstation for Windows**

NobiDownloader is a locally running web app for downloading supported online
media as video or MP3 using **yt-dlp** and **FFmpeg**.

## Highlights

- Clean Material-inspired local web interface
- Video quality presets: Best Available, 360p, 480p, 720p, 1080p, 2K and 4K
- MP3/audio downloading
- Custom download folder selection
- Download progress modal
- Download completion card with Open Folder
- Five eye-comfort themes
- Local-only server workflow
- Automatic dependency setup through the included launcher

## Requirements

- Windows 10/11
- Internet connection for downloading media and required dependencies
- PowerShell
- Python is installed/managed by the included launcher as supported by this build

## How to use — Method 1: Start locally

1. Download or clone this repository.
2. Open the NobiDownloader project folder.
3. Run **Start NobiDownloader.bat** (or the included start/launcher BAT file).
4. Allow the launcher to install/check required dependencies if prompted.
5. Keep the terminal window open while using NobiDownloader.
6. Open the local address shown by the launcher in your browser.
7. Paste a supported media URL, choose Video/MP3 and the desired quality.
8. Choose the save folder if needed and press **Download Now**.

## How to use — Method 2: GitHub PowerShell installer

If this project is published to GitHub with the included installer script,
open PowerShell and run the repository's published install command.

Example:

```powershell
irm https://raw.githubusercontent.com/YOUR-USERNAME/YOUR-REPOSITORY/main/install.ps1 | iex
```

The installer is intended to create a **NobiDownloader** folder on the
Windows Desktop, download the released application package, check the
required files, and prepare the local launcher.

> Replace `YOUR-USERNAME/YOUR-REPOSITORY` with the actual GitHub repository
> before publishing the command.

## Important

NobiDownloader runs locally. **Do not close the terminal window while the
web app is running** unless the launcher has been designed to run the server
as a background process.

Only download media that you have permission to download and use. Platform
terms, copyright, and other applicable laws still apply.

## Project structure

```text
NobiDownloader/
├── app/
│   ├── backend/
│   └── frontend/
├── downloads/
├── Start NobiDownloader.bat
├── .gitignore
└── README.md
```

## Technology

- Python
- FastAPI/Flask-style local backend as included in this build
- HTML / CSS / JavaScript
- yt-dlp
- FFmpeg

## Status

**V1 Beta — stable baseline**

This release is intended as the V1 baseline. Future UI and feature changes
should be developed as later versions without unnecessarily changing the
working V1 download engine.


## Release scripts

```text
scripts/
├── install.ps1       # Install latest GitHub release to Desktop
├── update.ps1        # Update an existing Desktop installation
└── build_release.py  # Build a clean release ZIP + SHA-256
```

The PowerShell installer is designed for the future short domain command:

```powershell
irm https://YOUR-DOMAIN/nobi | iex
```

Before publishing, replace `YOUR-DOMAIN` with your actual domain and verify the
repository URL inside `scripts/install.ps1`.
