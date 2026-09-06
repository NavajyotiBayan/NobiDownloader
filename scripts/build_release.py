"""Build a clean GitHub release ZIP.
Run from repository root: python scripts/build_release.py
"""
from pathlib import Path
import hashlib, zipfile

ROOT=Path(__file__).resolve().parents[1]
DIST=ROOT/"dist"
DIST.mkdir(exist_ok=True)
OUT=DIST/"NobiDownloader-V1-Beta.zip"
EXCLUDE={".git",".venv","venv","env","dist","__pycache__",".pytest_cache","downloads"}
if OUT.exists(): OUT.unlink()

with zipfile.ZipFile(OUT,"w",zipfile.ZIP_DEFLATED) as z:
    for p in ROOT.rglob("*"):
        if not p.is_file() or any(x in EXCLUDE for x in p.parts): continue
        if p.suffix.lower() in {".pyc",".pyo"}: continue
        z.write(p, Path(ROOT.name)/p.relative_to(ROOT))

sha=hashlib.sha256(OUT.read_bytes()).hexdigest()
(OUT.with_suffix(".sha256")).write_text(f"{sha}  {OUT.name}\n",encoding="utf-8")
print(f"Release: {OUT}")
print(f"SHA256: {sha}")
