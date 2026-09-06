from pathlib import Path
import asyncio
import json
import os
import re
import subprocess
import shutil
import uuid
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "app"
FRONTEND = APP / "frontend"
DEFAULT_DOWNLOADS = ROOT / "downloads"
TOOLS = ROOT / "tools"
YTDLP = TOOLS / "yt-dlp.exe"
FFMPEG = TOOLS / "ffmpeg" / "bin" / "ffmpeg.exe"
DEFAULT_DOWNLOADS.mkdir(exist_ok=True)

app = FastAPI(title="NobiDownloader", version="1.0.0-beta")
app.mount("/static", StaticFiles(directory=FRONTEND), name="static")
jobs = {}

class AnalyzeRequest(BaseModel):
    url: str

class DownloadRequest(BaseModel):
    url: str
    format_id: Optional[str] = None
    mode: str = "video"
    quality: str = "best"
    save_path: Optional[str] = None

class FolderRequest(BaseModel):
    path: str


def run_ytdlp(args):
    cmd = [str(YTDLP), "--no-playlist", "--no-warnings", "--ffmpeg-location", str(FFMPEG)] + args
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")


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


def normalize_requested_quality(quality):
    if isinstance(quality, str):
        return {"2k":"1440p", "4k":"2160p"}.get(quality.lower(), quality.lower())
    return quality

@app.get("/")
def index():
    return FileResponse(FRONTEND / "index.html")

@app.get("/api/health")
def health():
    return {"status":"ok","version":app.version,"yt_dlp":YTDLP.exists(),"ffmpeg":FFMPEG.exists()}

@app.post("/api/select-folder")
@app.post("/api/choose-folder")
def select_folder():
    if os.name != "nt":
        raise HTTPException(400, "Native Windows folder picker is only available on Windows.")

    ps = r"""
$ErrorActionPreference = "Stop"
try {
  $shell = New-Object -ComObject Shell.Application
  $folder = $shell.BrowseForFolder(0, "Choose NobiDownloader download folder", 0x0051, 0)
  if ($null -ne $folder) {
    $path = $folder.Self.Path
    if ($path) {
      [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
      Write-Output $path
    }
  }
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 2
}
"""
    try:
        proc = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-STA", "-Command", ps],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300
        )
        if proc.returncode != 0:
            raise HTTPException(500, proc.stderr.strip() or "Native folder picker failed.")
        output = proc.stdout.strip()
        path = output.splitlines()[-1].strip() if output else ""
        if not path:
            return {"path": "", "cancelled": True}
        p = Path(path)
        if not p.is_dir():
            raise HTTPException(400, "The selected location is not a folder.")
        return {"path": str(p.resolve()), "cancelled": False}
    except subprocess.TimeoutExpired:
        raise HTTPException(408, "Folder picker timed out.")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"Could not open the Windows folder picker: {exc}")

@app.post("/api/choose-folder")
def select_folder():
    """Open a real Windows folder chooser and return the selected absolute path."""
    scripts = [
        # Shell.Application is a reliable Windows-native folder picker and works without tkinter.
        r"$shell=New-Object -ComObject Shell.Application; $folder=$shell.BrowseForFolder(0,'Choose NobiDownloader download folder',0,0); if($folder){[Console]::Write($folder.Self.Path)}",
        # Fallback to WinForms if the COM picker is unavailable.
        r"Add-Type -AssemblyName System.Windows.Forms; $dialog=New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description='Choose NobiDownloader download folder'; $dialog.ShowNewFolderButton=$true; if($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){[Console]::Write($dialog.SelectedPath)}",
    ]
    errors = []
    for ps in scripts:
        try:
            result = subprocess.run(
                ["powershell.exe", "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-Command", ps],
                capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120
            )
            path = result.stdout.strip()
            if result.returncode == 0 and path:
                selected = Path(clean_windows_path(path))
                if selected.exists() and selected.is_dir():
                    return {"path": str(selected.resolve())}
            errors.append(result.stderr.strip() or "Folder selection was cancelled or unavailable.")
        except Exception as exc:
            errors.append(str(exc))
    raise HTTPException(500, "Could not open the Windows folder picker. " + (errors[-1] if errors else "Try entering the folder path manually."))

@app.post("/api/validate-folder")
def validate_folder(req: FolderRequest):
    try:
        p = validate_save_path(req.path)
        return {"ok": True, "path": str(p)}
    except Exception as exc:
        raise HTTPException(400, str(exc))

@app.post("/api/analyze")
def analyze(req: AnalyzeRequest):
    url = req.url.strip()
    if not re.match(r"^https?://", url, re.I):
        raise HTTPException(400, "Please enter a valid http/https URL.")
    result = run_ytdlp(["--dump-single-json", "--skip-download", url])
    if result.returncode != 0:
        raise HTTPException(422, (result.stderr or result.stdout).strip()[-1500:] or "Could not analyze this URL.")
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError:
        raise HTTPException(502, "The media extractor returned invalid metadata.")

    formats=[]
    for f in data.get("formats", []):
        if not f.get("format_id"):
            continue
        formats.append({
            "id": str(f.get("format_id")), "ext": f.get("ext"),
            "resolution": f.get("resolution") or (f"{f.get('width')}x{f.get('height')}" if f.get('width') and f.get('height') else None),
            "width": f.get("width"), "height": f.get("height"), "fps": f.get("fps"),
            "filesize": parse_size(f.get("filesize") or f.get("filesize_approx")),
            "vcodec": f.get("vcodec"), "acodec": f.get("acodec"), "tbr": f.get("tbr"), "abr": f.get("abr")
        })
    heights=sorted({int(f["height"]) for f in formats if f.get("height") and f.get("vcodec") not in (None,"none")}, reverse=True)
    abr_values=sorted({round(float(f["abr"])) for f in formats if f.get("abr") and f.get("acodec") not in (None,"none")}, reverse=True)
    return {
        "title": data.get("title") or "Untitled", "uploader": data.get("uploader") or data.get("channel") or "",
        "duration": data.get("duration"), "thumbnail": data.get("thumbnail"), "webpage_url": data.get("webpage_url") or url,
        "extractor": data.get("extractor_key") or data.get("extractor"), "formats": formats,
        "video_resolutions": heights, "audio_bitrates": abr_values
    }

@app.post("/api/download")
async def download(req: DownloadRequest):
    if not re.match(r"^https?://", req.url.strip(), re.I):
        raise HTTPException(400, "Invalid URL.")
    try: save_dir=validate_save_path(req.save_path)
    except ValueError as e: raise HTTPException(400,str(e))
    job_id=uuid.uuid4().hex[:10]
    jobs[job_id]={"status":"queued","progress":0.0,"speed":"","eta":"","filename":"","path":"","save_path":str(save_dir),"error":"","title":""}
    asyncio.create_task(download_job(job_id, req, save_dir))
    return {"job_id":job_id,"save_path":str(save_dir)}

async def download_job(job_id, req, save_dir: Path):
    jobs[job_id]["status"]="downloading"
    quality = normalize_requested_quality(req.quality)

    if req.mode=="audio":
        # Audio quality is handled separately by yt-dlp's audio-quality option.
        # Keep the existing bitrate-aware selection for MP3.
        if isinstance(quality, str) and quality.isdigit():
            fmt=f"bestaudio[abr<={quality}]/bestaudio/best"
            post=["--extract-audio","--audio-format","mp3","--audio-quality",quality]
        else:
            fmt="bestaudio/best"
            post=["--extract-audio","--audio-format","mp3","--audio-quality","0"]
    elif req.format_id:
        fmt=req.format_id
        post=["--merge-output-format","mp4"]
    elif isinstance(quality, str) and quality.endswith("p") and quality[:-1].isdigit():
        # IMPORTANT: never fall back to unrestricted 'best' here.
        # A requested resolution must remain at or below that resolution.
        h=int(quality[:-1])
        fmt=f"bestvideo[height<={h}]+bestaudio/best[height<={h}]"
        post=["--merge-output-format","mp4"]
    else:
        fmt="bestvideo+bestaudio/best"
        post=["--merge-output-format","mp4"]
    outtmpl=str(save_dir / "%(title).180B [%(id)s].%(ext)s")
    cmd=[str(YTDLP),"--newline","--no-playlist","--ffmpeg-location",str(FFMPEG),"-f",fmt,"-o",outtmpl]+post+[req.url]
    proc=await asyncio.create_subprocess_exec(*cmd,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.STDOUT)
    async for raw in proc.stdout:
        line=raw.decode("utf-8",errors="replace").strip()
        m=re.search(r"\[download\]\s+(\d+(?:\.\d+)?)%.*?(?:at\s+([^\s]+))?.*?(?:ETA\s+([^\s]+))?",line)
        if m:
            jobs[job_id]["progress"]=float(m.group(1)); jobs[job_id]["speed"]=m.group(2) or jobs[job_id]["speed"]; jobs[job_id]["eta"]=m.group(3) or jobs[job_id]["eta"]
        dm=re.search(r"Destination:\s+(.+)$",line)
        if dm: jobs[job_id]["filename"]=Path(dm.group(1)).name; jobs[job_id]["path"]=dm.group(1)
        fm=re.search(r'Merging formats into\s+"(.+?)"',line)
        if fm: jobs[job_id]["filename"]=Path(fm.group(1)).name; jobs[job_id]["path"]=fm.group(1)
    code=await proc.wait()
    if code==0:
        if not jobs[job_id]["path"]:
            candidates=sorted([p for p in save_dir.iterdir() if p.is_file()],key=lambda p:p.stat().st_mtime,reverse=True)
            if candidates: jobs[job_id]["path"]=str(candidates[0]); jobs[job_id]["filename"]=candidates[0].name
        jobs[job_id]["progress"]=100; jobs[job_id]["status"]="complete"
    else:
        jobs[job_id]["status"]="error"; jobs[job_id]["error"]="Download failed. Check the URL, access permissions, or terminal output."

@app.get("/api/jobs/{job_id}")
def job_status(job_id:str):
    if job_id not in jobs: raise HTTPException(404,"Job not found.")
    return jobs[job_id]


@app.get("/api/storage")
def storage_info():
    """Return real storage/download-folder information for the dashboard."""
    try:
        target = DEFAULT_DOWNLOADS
        target.mkdir(parents=True, exist_ok=True)
        total, used, free = shutil.disk_usage(target)
        files = [p for p in target.iterdir() if p.is_file()]
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
    for p in sorted(DEFAULT_DOWNLOADS.iterdir(),key=lambda x:x.stat().st_mtime,reverse=True):
        if p.is_file(): items.append({"name":p.name,"size":p.stat().st_size,"modified":p.stat().st_mtime,"path":str(p)})
    return items[:100]

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

