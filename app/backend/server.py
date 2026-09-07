from pathlib import Path
import asyncio
import json
import os
import re
import subprocess
import shutil
import uuid
import threading
import webbrowser
import logging
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "app"
FRONTEND = APP / "frontend"
DATA_ROOT = Path(os.environ.get("NOBI_DATA_ROOT", str(ROOT))).expanduser().resolve()
DEFAULT_DOWNLOADS = DATA_ROOT / "downloads"
TOOLS = DATA_ROOT / "tools"
YTDLP = TOOLS / "yt-dlp.exe"
FFMPEG = TOOLS / "ffmpeg" / "bin" / "ffmpeg.exe"
DEFAULT_DOWNLOADS.mkdir(exist_ok=True)

app = FastAPI(title="NobiDownloader", version="2.0.0")
app.mount("/static", StaticFiles(directory=FRONTEND), name="static")
jobs = {}
UVICORN_SERVER = None
PORT = int(os.environ.get("NOBI_PORT", "8765"))


@app.get("/")
def home():
    # Serve the dashboard at the URL opened by Start.bat.
    return FileResponse(FRONTEND / "index.html")


@app.get("/favicon.ico")
def favicon():
    # Avoid a noisy 404 in the browser developer console.
    icon = FRONTEND / "favicon.ico"
    if icon.exists():
        return FileResponse(icon)
    raise HTTPException(404, "Favicon not configured.")

class AnalyzeRequest(BaseModel):
    url: str

class DownloadRequest(BaseModel):
    url: str
    format_id: Optional[str] = None
    mode: str = "video"
    quality: str = "best"
    save_path: Optional[str] = None
    is_playlist: bool = False
    playlist_title: Optional[str] = None
    playlist_count: int = 0

class FolderRequest(BaseModel):
    path: str


def _parse_json_result(result):
    try:
        return json.loads(result.stdout)
    except Exception:
        # yt-dlp may emit informational lines; use the last JSON-looking line.
        for line in reversed(result.stdout.splitlines()):
            line=line.strip()
            if line.startswith("{") and line.endswith("}"):
                try:
                    return json.loads(line)
                except Exception:
                    pass
    return None


def run_ytdlp(args, allow_playlist=False):
    cmd = [str(YTDLP)]
    if not allow_playlist:
        cmd.append("--no-playlist")
    cmd += ["--no-warnings", "--ffmpeg-location", str(FFMPEG)] + args
    try:
        return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    except FileNotFoundError as exc:
        missing = YTDLP if not YTDLP.exists() else FFMPEG
        raise RuntimeError(f"Required downloader tool is missing: {missing}") from exc


def clean_windows_path(raw: str) -> str:
    value = (raw or "").strip().strip('"')
    return os.path.expandvars(os.path.expanduser(value))


def validate_save_path(raw: Optional[str]) -> Path:
    if not raw or not raw.strip():
        return DEFAULT_DOWNLOADS
    p = Path(clean_windows_path(raw)).resolve()
    p.mkdir(parents=True, exist_ok=True)
    if not p.is_dir():
        raise ValueError("Save location is not a directory.")
    return p


def parse_size(v):
    try:
        return int(v) if v else None
    except Exception:
        return None


def sanitize_folder_name(name: Optional[str]) -> str:
    value = (name or "Playlist").strip()
    value = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", value)
    value = re.sub(r'\s+', " ", value).strip(" .")
    return (value or "Playlist")[:120]

def normalize_requested_quality(quality):
    if isinstance(quality, str):
        return {"2k":"1440p", "4k":"2160p"}.get(quality.lower(), quality.lower())
    return quality


ALLOWED_VIDEO_QUALITIES = {"best", "360p", "480p", "720p", "1080p", "1440p", "2160p"}


def build_format_selector(req):
    quality = normalize_requested_quality(req.quality)
    if req.mode == "audio":
        if isinstance(quality, str) and quality.isdigit():
            # Audio selection is explicitly capped at the selected bitrate.
            return f"bestaudio[abr<={quality}]"
        return "bestaudio"
    if isinstance(quality, str) and quality in ALLOWED_VIDEO_QUALITIES:
        if quality == "best":
            return "bestvideo+bestaudio/best"
        h = int(quality[:-1])
        # Never fall back to an unrestricted/better-than-selected format.
        # The final alternative is still capped at the requested height.
        return f"bestvideo[height<={h}]+bestaudio/best[height<={h}]"
    raise ValueError(f"Unsupported video quality: {quality}")


@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest):
    url = req.url.strip()
    if not re.match(r"^https?://", url, re.I):
        raise HTTPException(400, "Invalid URL.")

    query = url.split("?", 1)[1] if "?" in url else ""
    looks_like_playlist = bool(re.search(r"(?:^|&)list=[^&]+", query, re.I))
    args = ["--dump-single-json", "--skip-download"]
    if looks_like_playlist:
        args += ["--yes-playlist", "--flat-playlist"]
    else:
        args += ["--no-playlist"]

    try:
        result = run_ytdlp(args + [url], allow_playlist=looks_like_playlist)
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "Could not analyze this URL.").strip().splitlines()[-1]
        raise HTTPException(400, detail[:500])

    data = _parse_json_result(result)
    if not data:
        raise HTTPException(400, "Could not read media information from this URL.")

    entries = data.get("entries") or []
    playlist_count = len(entries)
    is_playlist = looks_like_playlist and playlist_count > 0
    formats = []
    for f in (data.get("formats") or []):
        formats.append({
            "format_id": f.get("format_id"),
            "height": f.get("height"),
            "width": f.get("width"),
            "ext": f.get("ext"),
            "vcodec": f.get("vcodec"),
            "acodec": f.get("acodec"),
            "abr": f.get("abr"),
            "filesize": f.get("filesize") or f.get("filesize_approx"),
        })

    playlist_title = data.get("title") if is_playlist else data.get("playlist_title")
    if is_playlist and entries:
        playlist_title = data.get("title") or data.get("playlist_title")

    return {
        "title": data.get("title") or "Untitled media",
        "uploader": data.get("uploader") or data.get("channel") or "",
        "duration": data.get("duration"),
        "thumbnail": data.get("thumbnail") or "",
        "extractor": data.get("extractor_key") or data.get("extractor") or "MEDIA",
        "is_playlist": is_playlist,
        "playlist_count": playlist_count if is_playlist else 0,
        "playlist_title": playlist_title if is_playlist else None,
        "formats": formats,
    }


@app.post("/api/download")
async def download(req: DownloadRequest):
    if not re.match(r"^https?://", req.url.strip(), re.I):
        raise HTTPException(400, "Invalid URL.")
    try: save_dir=validate_save_path(req.save_path)
    except ValueError as e: raise HTTPException(400,str(e))
    # Keep playlist behavior safe even if a stale frontend state submits a
    # YouTube list URL without is_playlist=true.
    if re.search(r"(?:^|&)list=[^&]+", req.url.split("?", 1)[1] if "?" in req.url else "", re.I):
        req.is_playlist = True

    try:
        selected_selector = build_format_selector(req)
    except ValueError as e:
        raise HTTPException(400, str(e))

    job_id=uuid.uuid4().hex[:10]
    jobs[job_id]={
        "status":"queued", "progress":0.0, "filename":"", "path":"",
        "save_path":str(save_dir), "error":"", "title":"", "size":None,
        "size_text":"", "selected_mode":req.mode, "selected_quality":req.quality,
        "selected_selector":selected_selector, "total_items": int(req.playlist_count or 0),
        "completed_items": 0, "current_item": 0, "current_progress": 0.0,
        "downloaded_text": "", "cancel_requested": False
    }
    asyncio.create_task(download_job(job_id, req, save_dir))
    return {"job_id":job_id,"save_path":str(save_dir)}

async def download_job(job_id, req, save_dir: Path):
    jobs[job_id]["status"]="downloading"
    jobs[job_id]["title"] = req.playlist_title or ""
    quality = normalize_requested_quality(req.quality)
    is_playlist = bool(req.is_playlist)
    playlist_title = req.playlist_title

    # Never create a literal generic "Playlist" folder when the URL can tell
    # us the real YouTube playlist title. Resolve it again server-side.
    if is_playlist and re.search(r"(?:^|&)list=[^&]+", req.url.split("?", 1)[1] if "?" in req.url else "", re.I):
        try:
            title_result = run_ytdlp(
                ["--yes-playlist", "--flat-playlist", "--playlist-end", "1",
                 "--print", "%(playlist_title)s", "--skip-download", req.url],
                allow_playlist=True,
            )
            printed_titles = [line.strip() for line in title_result.stdout.splitlines()
                              if line.strip() and line.strip().lower() not in {"none", "null"}]
            if printed_titles:
                playlist_title = printed_titles[0]
        except Exception:
            pass

    playlist_dir = save_dir / sanitize_folder_name(playlist_title) if is_playlist else save_dir
    playlist_dir.mkdir(parents=True, exist_ok=True)

    fmt = build_format_selector(req)
    if req.mode=="audio":
        if isinstance(quality, str) and quality.isdigit():
            # Explicitly encode MP3 at the bitrate the user selected.
            post=["--extract-audio","--audio-format","mp3","--audio-quality",f"{quality}K"]
        else:
            post=["--extract-audio","--audio-format","mp3"]
    else:
        post=["--merge-output-format","mp4"]
    if is_playlist:
        # Keep every playlist download grouped in a folder named after the playlist.
        # playlist_index keeps the files in playlist order and title/id avoids collisions.
        outtmpl=str(playlist_dir / "%(playlist_index)03d - %(title).160B [%(id)s].%(ext)s")
        playlist_args=["--yes-playlist", "--ignore-errors"]
    else:
        outtmpl=str(save_dir / "%(title).180B [%(id)s].%(ext)s")
        playlist_args=["--no-playlist"]
    # yt-dlp emits the real transfer percentage. For playlists, convert each
    # video's percentage into one continuous overall percentage so the UI never
    # jumps back to 0% when the next item starts.
    if is_playlist and jobs[job_id]["total_items"] <= 0:
        try:
            count_result = run_ytdlp(
                ["--yes-playlist", "--flat-playlist", "--print", "%(playlist_index)s", "--skip-download", req.url],
                allow_playlist=True,
            )
            indexes = []
            for line in count_result.stdout.splitlines():
                line=line.strip()
                if line.isdigit(): indexes.append(int(line))
            if indexes:
                jobs[job_id]["total_items"] = max(indexes)
        except Exception:
            pass

    cmd=[str(YTDLP),"--newline","--ffmpeg-location",str(FFMPEG),"-f",fmt,"-o",outtmpl]+playlist_args+post+[req.url]
    proc=await asyncio.create_subprocess_exec(*cmd,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.STDOUT)
    jobs[job_id]["process"] = proc
    async for raw in proc.stdout:
        line=raw.decode("utf-8",errors="replace").strip()

        item_m=re.search(r"Downloading item (\d+) of (\d+)",line,re.I)
        if item_m:
            jobs[job_id]["current_item"] = int(item_m.group(1))
            jobs[job_id]["total_items"] = int(item_m.group(2))
            jobs[job_id]["completed_items"] = max(0, int(item_m.group(1))-1)

        m=re.search(r"\[download\]\s+(\d+(?:\.\d+)?)%",line)
        if m:
            pct=float(m.group(1))
            jobs[job_id]["current_progress"] = pct
            if is_playlist and jobs[job_id]["total_items"]:
                total=jobs[job_id]["total_items"]
                item=max(1,jobs[job_id]["current_item"])
                overall=((item-1)+(pct/100.0))/total*100.0
                # Keep 100% for the actual completion state only.
                jobs[job_id]["progress"] = min(99.8, overall)
            else:
                jobs[job_id]["progress"] = min(99.8, pct)

        # Optional transfer-size hint. yt-dlp usually prints: "X% of Y".
        size_m=re.search(r"\[download\].*?([0-9.]+(?:KiB|MiB|GiB|KB|MB|GB))\s+at\s",line,re.I)
        if size_m:
            jobs[job_id]["downloaded_text"] = size_m.group(1)

        dm=re.search(r"Destination:\s+(.+)$",line)
        if dm: jobs[job_id]["filename"]=Path(dm.group(1)).name; jobs[job_id]["path"]=dm.group(1)
        fm=re.search(r'Merging formats into\s+"(.+?)"',line)
        if fm: jobs[job_id]["filename"]=Path(fm.group(1)).name; jobs[job_id]["path"]=fm.group(1)

    code=await proc.wait()
    jobs[job_id].pop("process", None)
    if jobs[job_id].get("cancel_requested"):
        jobs[job_id]["status"]="stopped"
        jobs[job_id]["error"]="Download cancelled by user."
        jobs[job_id]["progress"] = min(float(jobs[job_id].get("progress") or 0), 99.8)
        return
    if code==0:
        if not jobs[job_id]["path"]:
            candidates=sorted([p for p in playlist_dir.rglob("*") if p.is_file()],key=lambda p:p.stat().st_mtime,reverse=True)
            if candidates: jobs[job_id]["path"]=str(candidates[0]); jobs[job_id]["filename"]=candidates[0].name
        jobs[job_id]["progress"]=100; jobs[job_id]["status"]="complete"
        if jobs[job_id].get("path"):
            try:
                actual = Path(jobs[job_id]["path"]).stat().st_size
                jobs[job_id]["size"] = actual
                jobs[job_id]["size_text"] = human_size(actual)
                jobs[job_id]["downloaded"] = human_size(actual)
            except Exception:
                pass
    else:
        jobs[job_id]["status"]="error"; jobs[job_id]["error"]="Download failed. Check the URL, access permissions, or terminal output."

@app.get("/api/jobs/{job_id}")
def job_status(job_id:str):
    if job_id not in jobs: raise HTTPException(404,"Job not found.")
    return jobs[job_id]


@app.post("/api/jobs/{job_id}/cancel")
async def cancel_job(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "Job not found.")
    job = jobs[job_id]
    if job.get("status") in {"complete", "error", "stopped"}:
        return {"ok": True, "status": job.get("status")}
    job["cancel_requested"] = True
    proc = job.get("process")
    if proc is not None:
        try:
            if proc.returncode is None:
                proc.terminate()
                try:
                    await asyncio.wait_for(proc.wait(), timeout=2.0)
                except asyncio.TimeoutError:
                    proc.kill()
        except Exception:
            pass
    job["status"] = "stopped"
    job["error"] = "Download cancelled by user."
    return {"ok": True, "status": "stopped"}


@app.get("/api/storage")
def storage_info():
    """Return real storage/download-folder information for the dashboard."""
    try:
        target = DEFAULT_DOWNLOADS
        target.mkdir(parents=True, exist_ok=True)
        total, used, free = shutil.disk_usage(target)
        files = [p for p in target.rglob("*") if p.is_file()]
        download_bytes = sum(p.stat().st_size for p in files)
        return {
            "path": str(target.resolve()),
            "file_count": len(files),
            "download_bytes": download_bytes,
            "disk_total": total,
            "disk_used": used,
            "disk_free": free,
            "disk_percent": round((used / total) * 100, 1) if total else 0,
        }
    except Exception as exc:
        raise HTTPException(500, f"Could not read storage information: {exc}")

@app.get("/api/downloads")
def list_downloads():
    items=[]
    for p in sorted((p for p in DEFAULT_DOWNLOADS.rglob("*") if p.is_file()),key=lambda x:x.stat().st_mtime,reverse=True):
        try:
            rel = p.relative_to(DEFAULT_DOWNLOADS)
        except ValueError:
            rel = p.name
        items.append({
            "name": p.name,
            "relative_name": str(rel),
            "folder": rel.parent.name if hasattr(rel, "parent") and str(rel.parent) != "." else "",
            "size": p.stat().st_size,
            "modified": p.stat().st_mtime,
            "path": str(p)
        })
    return items[:100]

@app.post("/api/shutdown")
async def shutdown_server():
    """Safely stop active downloads and request Uvicorn to exit."""
    active = []
    for job in jobs.values():
        if job.get("status") in {"queued", "downloading"} and job.get("process"):
            active.append(job)

    for job in active:
        proc = job.get("process")
        try:
            if proc.returncode is None:
                proc.terminate()
        except Exception:
            pass
        job["cancel_requested"] = True
        job["status"] = "stopped"
        job["error"] = "Server stopped by user."

    server = UVICORN_SERVER
    if server is None:
        raise HTTPException(503, "Server shutdown is not available yet.")

    async def request_exit():
        await asyncio.sleep(0.35)
        server.should_exit = True

    asyncio.create_task(request_exit())
    return {"ok": True, "stopped_jobs": len(active)}


@app.post("/api/select-folder")
def select_folder():
    """Open the modern Windows Explorer-style common dialog and select a folder."""
    if os.name != "nt":
        raise HTTPException(501, "Windows folder picker is available only on Windows.")

    default_path = str(DEFAULT_DOWNLOADS.resolve())
    # OpenFileDialog uses the normal Windows Explorer-style common dialog.
    # A placeholder filename lets the user navigate normally and choose the
    # current folder with the Open button.
    script = r"""
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms

$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = 'Choose NobiDownloader download folder'
$dialog.InitialDirectory = [Environment]::GetEnvironmentVariable('NOBI_DEFAULT_FOLDER')
$dialog.CheckFileExists = $false
$dialog.CheckPathExists = $true
$dialog.ValidateNames = $false
$dialog.Multiselect = $false
$dialog.RestoreDirectory = $false
$dialog.AddExtension = $false
$dialog.DefaultExt = ''
$dialog.FileName = 'Select this folder'
$dialog.Filter = 'Folders|*.'

$result = $dialog.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    $selected = $dialog.FileName
    if ($selected.EndsWith('Select this folder', [System.StringComparison]::OrdinalIgnoreCase)) {
        $selected = $selected.Substring(0, $selected.Length - 'Select this folder'.Length).TrimEnd('\')
    }
    if ($selected) {
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        [Console]::Write($selected)
    }
}
"""

    try:
        env = os.environ.copy()
        env["NOBI_DEFAULT_FOLDER"] = default_path
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-STA", "-Command", script],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=env,
            timeout=300,
        )
        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "Windows folder picker failed.").strip()
            raise RuntimeError(detail)

        path = (result.stdout or "").strip()
        if not path:
            return {"canceled": True, "path": ""}

        chosen = Path(clean_windows_path(path)).resolve()
        chosen.mkdir(parents=True, exist_ok=True)
        if not chosen.is_dir():
            raise RuntimeError("The selected location is not a folder.")
        return {"canceled": False, "path": str(chosen)}
    except subprocess.TimeoutExpired:
        raise HTTPException(408, "Folder picker timed out. Please try again.")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"Could not open the Windows folder picker: {exc}")


@app.post("/api/open-folder")
def open_folder(req: FolderRequest):
    """Open a real Windows Explorer window for a file or folder."""
    try:
        raw = clean_windows_path(req.path)
        p = Path(raw) if raw else DEFAULT_DOWNLOADS
        if not p.is_absolute():
            p = (Path.cwd() / p).resolve()

        # If the file exists, select it in Explorer. Otherwise open its parent.
        if p.exists() and p.is_file():
            subprocess.Popen(["explorer.exe", "/select,", str(p)])
            return {"ok": True, "path": str(p)}
        if p.exists() and p.is_dir():
            subprocess.Popen(["explorer.exe", str(p)])
            return {"ok": True, "path": str(p)}

        parent = p.parent
        if parent.exists() and parent.is_dir():
            subprocess.Popen(["explorer.exe", str(parent)])
            return {"ok": True, "path": str(parent), "fallback": True}

        # For an empty/default request, always fall back to the app's real folder.
        default = DEFAULT_DOWNLOADS.resolve()
        default.mkdir(parents=True, exist_ok=True)
        subprocess.Popen(["explorer.exe", str(default)])
        return {"ok": True, "path": str(default), "fallback": True}
    except Exception as exc:
        raise HTTPException(500, f"Could not open the download folder: {exc}")



if __name__ == "__main__":
    # Run Uvicorn in this same Python process so the launcher console owns
    # the server lifetime. Closing the launcher therefore closes the server.
    def _open_browser():
        try:
            webbrowser.open(f"http://127.0.0.1:{PORT}/")
        except Exception:
            pass

    if os.environ.get("NOBI_ELECTRON") != "1":
        threading.Timer(1.0, _open_browser).start()

    import uvicorn
    log_path = DATA_ROOT / "logs" / "server.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        handlers=[
            logging.StreamHandler(),
            logging.FileHandler(log_path, encoding="utf-8"),
        ],
        force=True,
    )

    config = uvicorn.Config(
        app,
        host="127.0.0.1",
        port=PORT,
        log_level="info",
        log_config=None,
    )
    UVICORN_SERVER = uvicorn.Server(config)
    UVICORN_SERVER.run()
