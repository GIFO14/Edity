"""Cache a small, full-length audio track for instant in-memory edit playback."""

import json
import os
import subprocess
import threading
from pathlib import Path

from services.preview import _cached, prepare_preview

_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


def _lock_for(path: Path) -> threading.Lock:
    with _locks_guard:
        return _locks.setdefault(str(path), threading.Lock())


def prepare_playback_audio(video_path: str, studio_sound: bool = False) -> dict:
    original = Path(video_path).expanduser().resolve()
    if not original.is_file():
        raise FileNotFoundError(original)
    source = original
    if studio_sound:
        source = _cached(original, True)
        if source is None:
            result = prepare_preview(str(original), True)
            if result["status"] != "ready":
                return result
            source = Path(result["path"])

    suffix = "-studio" if studio_sound else ""
    output = original.with_name(f"{original.stem}.edity-audio{suffix}.m4a")
    metadata = output.with_suffix(".json")
    stat = source.stat()
    fingerprint = {"source": str(source), "size": stat.st_size,
                   "mtime_ns": stat.st_mtime_ns, "version": 1}

    def cached() -> bool:
        try:
            return (output.stat().st_size > 0 and
                    json.loads(metadata.read_text(encoding="utf-8")) == fingerprint)
        except (OSError, ValueError):
            return False

    if cached():
        return {"status": "ready", "path": str(output), "progress": 100}

    with _lock_for(output):
        if cached():
            return {"status": "ready", "path": str(output), "progress": 100}
        temporary = output.with_name(f"{output.stem}.tmp.m4a")
        try:
            command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                       "-i", str(source), "-map", "0:a:0", "-vn", "-ac", "1",
                       "-ar", "24000", "-c:a", "aac", "-b:a", "64k",
                       "-movflags", "+faststart", str(temporary)]
            subprocess.run(command, capture_output=True, text=True, check=True,
                           creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
            os.replace(temporary, output)
            metadata.write_text(json.dumps(fingerprint), encoding="utf-8")
        finally:
            temporary.unlink(missing_ok=True)
    return {"status": "ready", "path": str(output), "progress": 100}
