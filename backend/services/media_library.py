"""Index local media folders and describe visual assets with Codex vision."""

import hashlib
import json
import logging
import math
import os
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

from services.ai_provider import AIProvider
from services.media import EXTENSIONS

logger = logging.getLogger(__name__)
MAX_ASSETS = 500
_lock = threading.Lock()
_job: dict = {"status": "idle", "processed": 0, "total": 0, "error": ""}


def _cache_path() -> Path:
    if os.name == "nt":
        base = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Caches"
    else:
        base = Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache")
    root = base / "Edity"
    root.mkdir(parents=True, exist_ok=True)
    return root / "media-index.json"


def _read_cache() -> dict:
    try:
        data = json.loads(_cache_path().read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _write_cache(data: dict) -> None:
    target = _cache_path()
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    os.replace(temporary, target)


def _folders(folders: dict) -> dict[str, Path]:
    selected = {}
    for kind in EXTENSIONS:
        raw = str(folders.get(kind) or "").strip()
        if not raw:
            continue
        folder = Path(raw).expanduser().resolve()
        if not folder.is_dir():
            raise ValueError(f"{kind} folder does not exist: {folder}")
        selected[kind] = folder
    return selected


def _scan(folders: dict) -> list[dict]:
    result = []
    seen = set()
    for kind, folder in _folders(folders).items():
        for path in folder.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in EXTENSIONS[kind]:
                continue
            absolute = str(path.resolve())
            if absolute in seen:
                continue
            seen.add(absolute)
            stat = path.stat()
            result.append({"id": hashlib.sha256(absolute.encode("utf-8")).hexdigest()[:16],
                           "type": kind, "path": absolute, "name": path.name,
                           "size": stat.st_size, "mtime_ns": stat.st_mtime_ns})
            if len(result) > MAX_ASSETS:
                raise ValueError(f"Media library has more than {MAX_ASSETS} supported files; choose smaller folders")
    return result


def _probe(path: str) -> dict:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration:format_tags=title,artist,genre,mood,bpm,TBPM,comment",
         "-of", "json", path], capture_output=True, text=True, check=True, timeout=30,
    )
    fmt = json.loads(result.stdout).get("format", {})
    try:
        duration = float(fmt.get("duration", 0))
    except (TypeError, ValueError):
        duration = 0
    return {"duration": max(0, duration), "tags": fmt.get("tags") or {}}


def _visual_sheets(asset: dict, duration: float, directory: Path) -> list[Path]:
    if asset["type"] == "image":
        filters = "scale=960:960:force_original_aspect_ratio=decrease"
        output = directory / "contact.jpg"
        count = 1
    else:
        interval = max(1, math.ceil(duration / 24))
        filters = (f"fps=1/{interval},scale=320:180:force_original_aspect_ratio=decrease,"
                   "pad=320:180:(ow-iw)/2:(oh-ih)/2,tile=4x3:padding=2:margin=2:color=black")
        output = directory / "contact-%02d.jpg"
        count = 2
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", asset["path"],
         "-vf", filters, "-frames:v", str(count), str(output)],
        capture_output=True, text=True, timeout=90,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )
    sheets = sorted(directory.glob("contact*.jpg"))
    if result.returncode or not sheets:
        raise RuntimeError((result.stderr or "Could not extract video frames")[-500:])
    return sheets


def _describe(asset: dict) -> dict:
    metadata = _probe(asset["path"]) if asset["type"] != "image" else {"duration": 0, "tags": {}}
    if asset["type"] == "music":
        tags = metadata["tags"]
        details = ", ".join(f"{key}: {value}" for key, value in tags.items()
                            if key.lower() in {"title", "artist", "genre", "mood", "bpm", "tbpm", "comment"})
        description = f"Audio file. {details or 'No descriptive metadata; listen before choosing its mood.'}"
    else:
        with tempfile.TemporaryDirectory(prefix="edity-media-vision-") as directory:
            sheets = _visual_sheets(asset, metadata["duration"], Path(directory))
            interval = max(1, math.ceil(metadata["duration"] / 24))
            raw = AIProvider.complete(
                prompt=(f"Describe the visible content of this {'image' if asset['type'] == 'image' else 'B-roll contact sheet'}. "
                        f"For B-roll, tiles run chronologically across images, roughly {interval} seconds apart starting at 0s. "
                        "State concrete subjects, actions, approximate times of scene changes, text visible in the frames, and useful visual themes. "
                        "Do not infer unseen events, audio, or licensing. Reply in at most 80 words."),
                provider="codex", image_paths=[str(sheet) for sheet in sheets],
                system_prompt="You are cataloging visual footage for a video editor. Describe only what is visible.",
            )
            description = raw.strip()[:800]
            if not description:
                raise RuntimeError("Codex returned an empty visual description")
    return {**asset, "duration": round(metadata["duration"], 3), "description": description}


def catalog_media(folders: dict) -> list[dict]:
    """Only return descriptions that still match the source file fingerprint."""
    assets = _scan(folders)
    cache = _read_cache()
    return [cache[asset["path"]] for asset in assets
            if asset["path"] in cache
            and all(cache[asset["path"]].get(key) == asset[key] for key in ("size", "mtime_ns", "type"))]


def _index(folders: dict, job: dict) -> None:
    try:
        assets = _scan(folders)
        job["total"] = len(assets)
        cache = _read_cache()
        for asset in assets:
            old = cache.get(asset["path"], {})
            if all(old.get(key) == asset[key] for key in ("size", "mtime_ns", "type")) and old.get("description"):
                job["processed"] += 1
                continue
            try:
                cache[asset["path"]] = _describe(asset)
                _write_cache(cache)
            except Exception as exc:
                if str(exc).startswith("Codex "):
                    raise
                logger.warning("Could not analyze media %s: %s", asset["path"], exc)
                job["failures"].append(f"{asset['name']}: {str(exc)[:120]}")
            job["processed"] += 1
        job["status"] = "ready"
    except Exception as exc:
        job.update(status="error", error=str(exc))


def start_media_index(folders: dict) -> dict:
    assets = _scan(folders)
    with _lock:
        if _job["status"] == "analyzing":
            return media_index_status()
        job = {"status": "analyzing", "processed": 0, "total": len(assets),
               "error": "", "failures": []}
        _job.clear()
        _job.update(job)
        threading.Thread(target=_index, args=(dict(folders), _job), daemon=True).start()
    return media_index_status()


def media_index_status() -> dict:
    return {key: _job.get(key) for key in ("status", "processed", "total", "error", "failures")}
