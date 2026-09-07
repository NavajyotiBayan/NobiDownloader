# NobiDownloader

**NobiDownloader** is a free, open-source Windows desktop media downloader powered by **yt-dlp** and **FFmpeg**.

Paste a video or playlist URL, analyze it, choose what you need, and save the result to the folder you choose.

> **Desktop Edition — v2.0.0**

## Features

- Clean Windows desktop application built with Electron
- Video and audio downloads through yt-dlp
- FFmpeg-powered media processing
- Playlist support
- Custom download location with the native Windows folder picker
- Right-click paste support
- Local processing: the download engine runs on your computer
- No manual Python, FastAPI, or terminal startup for end users
- Portable build available in every Windows release

## Installation

### 1. Direct download — recommended

Open the **Releases** page and download:

`NobiDownloader-2.0.0-Setup.exe`

Run the installer and follow the Windows installation steps.

For a portable copy, download:

`NobiDownloader-2.0.0-Portable.exe`

No installation is required for the portable build.

### 2. Automatic PowerShell installation

Open PowerShell and run:

```powershell
irm https://raw.githubusercontent.com/NavajyotiBayan/NobiDownloader/main/scripts/install.ps1 | iex
```

The installer script checks the latest GitHub Release, downloads the matching NobiDownloader Setup.exe, and starts the normal Windows installer.

> Review the script before piping it to `iex` if you prefer to inspect installation scripts first.

## How it works

NobiDownloader is a desktop application. Electron starts the local download engine automatically and shuts it down when the application exits. The application does **not** require the user to manually start a local server.

On first launch, required runtime components are prepared in the user's writable NobiDownloader application-data directory. This avoids requiring write access to `Program Files`.

Internet access is required when downloading online media or when the first-run runtime components need to be obtained.

## Open-source components and credits

NobiDownloader is built on the work of several open-source projects. Please support and respect the licenses of each dependency.

- **yt-dlp** — media extraction and downloading. https://github.com/yt-dlp/yt-dlp
- **FFmpeg** — audio/video processing. https://ffmpeg.org/
- **Electron** — cross-platform desktop application runtime. https://github.com/electron/electron
- **electron-builder** — application packaging and Windows installers. https://github.com/electron-userland/electron-builder
- **FastAPI** — Python web/API framework used by the local download engine. https://github.com/fastapi/fastapi
- **Uvicorn** — ASGI server used to run the FastAPI application. https://github.com/encode/uvicorn
- **Pydantic** — data validation used by the backend. https://github.com/pydantic/pydantic
- **Python** — runtime for the backend and supporting tools. https://www.python.org/

See `THIRD-PARTY-NOTICES.md` for additional licensing and attribution information.

## License

NobiDownloader source code is released under the license included in `LICENSE`.

Third-party components remain under their respective licenses.

## Disclaimer

NobiDownloader is a technical download utility. Users are responsible for complying with the terms of service, copyright rules, and applicable laws for the websites and content they access.

## Contributing

Bug reports, improvements, documentation updates, and pull requests are welcome. Please use the GitHub issue tracker for reproducible problems and feature discussions.

---

**NobiDownloader — Download Media Your Way.**
