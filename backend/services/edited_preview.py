"""Render a continuous playback proxy for the current cuts."""

import hashlib
import json
import logging
import os
import subprocess
import tempfile
import threading
import uuid
from pathlib import Path

from services.preview import _cached, prepare_preview
from services.cut_refinement import refine_keep_segments

logger = logging.getLogger(__name__)
_jobs: dict[str, dict] = {}
_lock = threading.Lock()


def _segments(raw: list[dict], duration: float) -> list[tuple[float, float]]:
    if not raw or len(raw) > 5000:
        raise ValueError("A cut preview needs between 1 and 5000 kept segments")
    result = []
    previous_end = 0.0
    for item in raw:
        start, end = float(item["start"]), float(item["end"])
        if not (0 <= previous_end <= start < end <= duration + 0.5 and start < duration):
            raise ValueError("Kept segments must be ordered and inside the source video")
        result.append((round(start, 6), round(min(end, duration), 6)))
        previous_end = end
    return result


def _duration(source: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(source)],
        capture_output=True, text=True, check=True,
    )
    return float(result.stdout.strip())


def _has_audio(source: Path) -> bool:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
         "stream=index", "-of", "csv=p=0", str(source)],
        capture_output=True, text=True, check=True,
    )
    return bool(result.stdout.strip())


def _prune_old_previews(original: Path, current: Path) -> None:
    variants = sorted((path for path in original.parent.glob(f"{original.stem}.edity-edit-*.mp4")
                       if ".tmp." not in path.name),
                      key=lambda path: path.stat().st_mtime_ns, reverse=True)
    # Keep the newest edited preview for each base: plain audio and Studio
    # Sound. Keeping only two globally can discard the plain version when a
    # Studio render follows another edit, forcing a full render at next launch.
    retained_sources: set[str] = set()
    for previous in variants:
        try:
            fingerprint = json.loads(previous.with_suffix(".json").read_text(encoding="utf-8"))
            base_source = fingerprint["source"]
        except (OSError, ValueError, KeyError, TypeError):
            base_source = ""
        if previous == current or (base_source and base_source not in retained_sources):
            if base_source:
                retained_sources.add(base_source)
            continue
        try:
            previous.unlink()
            previous.with_suffix(".json").unlink(missing_ok=True)
        except OSError:
            # Windows keeps an MP4 locked while it is playing; try next render.
            pass


def _render(source: Path, output: Path, segments: list[tuple[float, float]], job: dict) -> None:
    temporary = output.with_name(f"{output.stem}.{uuid.uuid4().hex}.tmp.mp4")
    total = sum(end - start for start, end in segments)
    try:
        if job["cancelled"]:
            return
        with tempfile.TemporaryDirectory(prefix="edity_edit_preview_") as directory:
            script = Path(directory) / "filters.txt"
            audio = _has_audio(source)
            filters = []
            video_inputs = []
            audio_inputs = []
            for index, (start, end) in enumerate(segments):
                filters.append(f"[0:v]trim=start={start}:end={end},setpts=PTS-STARTPTS[v{index}]")
                video_inputs.append(f"[v{index}]")
                if audio:
                    filters.append(f"[0:a]atrim=start={start}:end={end},asetpts=PTS-STARTPTS[a{index}]")
                    audio_inputs.append(f"[a{index}]")
            filters.append(f"{''.join(video_inputs)}concat=n={len(segments)}:v=1:a=0[vout]")
            if audio:
                # Coupled A/V concat pads audio with silence to match rounded video frames.
                # Independent audio concat keeps speech samples adjacent at every cut.
                filters.append(f"{''.join(audio_inputs)}concat=n={len(segments)}:v=0:a=1[aout]")
            script.write_text(";".join(filters), encoding="utf-8")
            command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostats", "-y",
                       "-i", str(source), "-filter_complex_script", str(script),
                       "-map", "[vout]"]
            if audio:
                command += ["-map", "[aout]"]
            command += ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "27",
                        "-g", "15", "-bf", "0"]
            if audio:
                command += ["-c:a", "aac", "-b:a", "128k"]
            command += ["-movflags", "+faststart", "-progress", "pipe:1", str(temporary)]
            process = subprocess.Popen(
                command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, encoding="utf-8", errors="replace",
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
            job["process"] = process
            diagnostics = []
            assert process.stdout is not None
            for line in process.stdout:
                line = line.strip()
                if line.startswith("out_time="):
                    try:
                        h, m, s = line.split("=", 1)[1].split(":")
                        elapsed = int(h) * 3600 + int(m) * 60 + float(s)
                        job["progress"] = min(99, round(100 * elapsed / total))
                    except (ValueError, ZeroDivisionError):
                        pass
                elif line and "=" not in line:
                    diagnostics.append(line)
                    diagnostics = diagnostics[-8:]
            process.stdout.close()
            if process.wait() != 0:
                raise RuntimeError("; ".join(diagnostics)[-500:] or "Could not render cut preview")
        if job["cancelled"]:
            return
        if abs(_duration(temporary) - total) > 0.5:
            raise RuntimeError("Cut preview duration does not match its segments")
        os.replace(temporary, output)
        output.with_suffix(".json").write_text(json.dumps(job["fingerprint"]), encoding="utf-8")
        job.update(status="ready", progress=100, path=str(output))
        _prune_old_previews(Path(job["source"]), output)
    except Exception as error:
        if not job["cancelled"]:
            logger.warning("Cut preview failed: %s", error)
            job.update(status="error", error=str(error))
    finally:
        if job["cancelled"]:
            job["status"] = "cancelled"
        job["process"] = None
        temporary.unlink(missing_ok=True)


def edited_preview(video_path: str, studio_sound: bool, keep_segments: list[dict]) -> dict:
    original = Path(video_path).expanduser().resolve()
    if not original.is_file():
        raise FileNotFoundError(original)
    refined = refine_keep_segments(str(original), keep_segments)
    base = _cached(original, studio_sound)
    if not base:
        result = prepare_preview(str(original), studio_sound)
        if result["status"] != "ready":
            return {"status": result["status"],
                    "stage": result.get("stage", "Preparing playback"),
                    "progress": result.get("progress", 0),
                    "error": result.get("error", ""), "keep_segments": refined}
        base = Path(result["path"])
    segments = _segments(refined, _duration(base))
    stat = base.stat()
    fingerprint = {"source": str(base), "size": stat.st_size, "mtime_ns": stat.st_mtime_ns,
                   "segments": [list(segment) for segment in segments]}
    digest = hashlib.sha256(json.dumps(fingerprint).encode()).hexdigest()[:20]
    output = original.with_name(f"{original.stem}.edity-edit-{digest}.mp4")
    try:
        if (output.stat().st_size > 0 and
                json.loads(output.with_suffix(".json").read_text(encoding="utf-8")) == fingerprint):
            return {"status": "ready", "progress": 100, "path": str(output),
                    "keep_segments": refined}
    except (OSError, ValueError):
        pass
    with _lock:
        job = _jobs.get(digest)
        if job and job["status"] in {"preparing", "error"}:
            return {**{field: job[field] for field in
                       ("status", "stage", "progress", "error", "path")},
                    "keep_segments": refined}
        # New edits supersede an old render; do not keep encoding obsolete cuts.
        for old in _jobs.values():
            if old["source"] == str(original) and old["status"] == "preparing":
                old["cancelled"] = True
                process = old["process"]
                if process and process.poll() is None:
                    process.terminate()
        job = {"source": str(original), "status": "preparing", "stage": "Joining kept video",
               "progress": 0, "error": "", "path": "", "cancelled": False,
               "process": None, "fingerprint": fingerprint}
        _jobs[digest] = job
        threading.Thread(target=_render, args=(base, output, segments, job), daemon=True).start()
    return {"status": "preparing", "stage": job["stage"], "progress": 0,
            "keep_segments": refined}
