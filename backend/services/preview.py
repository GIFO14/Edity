"""Build a seekable, low-resolution preview without changing the edit source."""

import json
import logging
import os
import subprocess
import tempfile
import threading
from pathlib import Path
from functools import lru_cache
from fractions import Fraction

logger = logging.getLogger(__name__)
_jobs: dict[str, dict] = {}
_lock = threading.Lock()


def _paths(source: Path, studio_sound: bool = False, max_height: int = 720) -> tuple[Path, Path, Path]:
    variant = ("-studio" if studio_sound else "") + (f"-{max_height}p" if max_height != 720 else "")
    stem = f"{source.stem}.edity-preview{variant}"
    return (source.with_name(f"{stem}.mp4"), source.with_name(f"{stem}.json"),
            source.with_name(f"{stem}.tmp.mp4"))


@lru_cache(maxsize=128)
def _source_rate(file, size, mtime):
    result=subprocess.run(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=avg_frame_rate','-of','csv=p=0',str(file)],capture_output=True,text=True,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    try:return str(Fraction(result.stdout.strip().splitlines()[0]))
    except (ValueError,IndexError,ZeroDivisionError):return '30'

def _fingerprint(source: Path, studio_sound: bool = False, max_height: int = 720) -> dict:
    stat = source.stat()
    fingerprint = {"size": stat.st_size, "mtime_ns": stat.st_mtime_ns}
    rate=_source_rate(str(source),stat.st_size,stat.st_mtime_ns)
    if Fraction(rate)>30:fingerprint["native_fps"]=rate
    if max_height != 720:
        fingerprint["max_height"] = max_height
    if studio_sound:
        fingerprint.update({"studio_sound": True, "studio_sound_version": 1})
    return fingerprint


def _cached(source: Path, studio_sound: bool = False, max_height: int = 720) -> Path | None:
    output, metadata, _ = _paths(source, studio_sound, max_height)
    try:
        if (output.stat().st_size > 0
                and json.loads(metadata.read_text(encoding="utf-8")) == _fingerprint(source, studio_sound, max_height)):
            return output
    except (OSError, ValueError):
        pass
    return None


def _duration(source: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(source)],
        capture_output=True, text=True, check=True,
    )
    return float(result.stdout.strip())


def _encode(source: Path, temporary: Path, duration: float, job: dict, gpu: bool,
            audio_path: Path | None = None, max_height: int = 720) -> None:
    dimensions = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=height", "-of", "csv=p=0", str(source)], capture_output=True, text=True, check=True)
    height = max(2, min(max_height, int(dimensions.stdout.strip().splitlines()[0])) // 2 * 2)
    stat=source.stat();fps=_source_rate(str(source),stat.st_size,stat.st_mtime_ns)
    video_options = (
        ["-hwaccel", "cuda", "-hwaccel_output_format", "cuda"] if gpu else []
    )
    filter_options = (
        ["-vf", f"scale_cuda=-2:{height}", "-r", fps, "-c:v", "h264_nvenc",
         "-preset", "p1", "-cq", "25", "-b:v", "0"] if gpu else
        ["-vf", f"fps={fps},scale=-2:{height}:flags=fast_bilinear", "-c:v", "libx264",
         "-preset", "ultrafast", "-crf", "27"]
    )
    inputs = [*video_options, "-i", str(source)]
    audio_map = "0:a:0?"
    if audio_path:
        inputs.extend(["-i", str(audio_path)])
        audio_map = "1:a:0"
    command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostats", "-y",
               *inputs, *filter_options,
               "-g", "15", "-keyint_min", "15", "-bf", "0",
               "-map", "0:v:0", "-map", audio_map, "-c:a", "aac", "-b:a", "128k",
               "-shortest", "-movflags", "+faststart", "-progress", "pipe:1", str(temporary)]
    flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                               text=True, encoding="utf-8", errors="replace",
                               creationflags=flags)
    job["process"] = process
    diagnostics = []
    assert process.stdout is not None
    for line in process.stdout:
        line = line.strip()
        if line.startswith("out_time="):
            try:
                hours, minutes, seconds = line.split("=", 1)[1].split(":")
                elapsed = int(hours) * 3600 + int(minutes) * 60 + float(seconds)
                base = 25 if audio_path else 0
                job["progress"] = min(99, base + round((99 - base) * elapsed / duration))
            except (ValueError, ZeroDivisionError):
                pass
        elif line and "=" not in line:
            diagnostics.append(line)
            diagnostics = diagnostics[-8:]
    process.stdout.close()
    if process.wait() != 0:
        raise RuntimeError("; ".join(diagnostics)[-500:] or "FFmpeg preview generation failed")


def _prepare(source: Path, job: dict, studio_sound: bool, max_height: int = 720) -> None:
    output, metadata, temporary = _paths(source, studio_sound, max_height)
    try:
        duration = _duration(source)
        if duration <= 0:
            raise RuntimeError("The video has no duration")
        with tempfile.TemporaryDirectory(prefix="edity_studio_preview_") as directory:
            cleaned_audio = None
            if studio_sound:
                from services.audio_cleaner import clean_audio
                job.update(stage="Applying Studio Sound to playback", progress=1)
                cleaned_audio = Path(directory) / "cleaned.wav"
                clean_audio(str(source), str(cleaned_audio),
                            lambda percent: job.update(progress=min(25, 1 + round(percent * 0.24))))
                job.update(stage="Building Studio Sound playback", progress=25)
            for gpu in (True, False):
                if job["cancelled"]:
                    return
                try:
                    _encode(source, temporary, duration, job, gpu, cleaned_audio, max_height)
                    break
                except RuntimeError:
                    if not gpu or job["cancelled"]:
                        raise
                    logger.info("GPU preview encoding unavailable; trying CPU encoding")
                    temporary.unlink(missing_ok=True)
                    job["progress"] = 25 if studio_sound else 0
        if job["cancelled"]:
            return
        if abs(_duration(temporary) - duration) > 0.5:
            raise RuntimeError("Preview duration does not match the source")
        if _fingerprint(source, studio_sound, max_height) != job["fingerprint"]:
            raise RuntimeError("The video changed while its preview was being prepared")
        os.replace(temporary, output)
        metadata.write_text(json.dumps(job["fingerprint"]), encoding="utf-8")
        job.update(status="ready", progress=100, path=str(output))
    except Exception as error:
        if job["cancelled"]:
            job["status"] = "cancelled"
        else:
            logger.warning("Preview generation failed: %s", error)
            job.update(status="error", error=str(error))
    finally:
        job["process"] = None
        temporary.unlink(missing_ok=True)


def _job_key(source: Path, studio_sound: bool, max_height: int = 720) -> str:
    return f"{source}|studio={int(studio_sound)}|height={max_height}"


def prepare_preview(video_path: str, studio_sound: bool = False, max_height: int = 720) -> dict:
    if max_height not in (360, 480, 720, 1080):
        raise ValueError("Unsupported preview quality")
    source = Path(video_path).expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    cached = _cached(source, studio_sound, max_height)
    if cached:
        return {"status": "ready", "progress": 100, "path": str(cached)}
    key = _job_key(source, studio_sound, max_height)
    with _lock:
        existing = _jobs.get(key)
        if existing and existing["fingerprint"] == _fingerprint(source, studio_sound, max_height):
            if existing["status"] in {"preparing", "error"}:
                return {field: existing[field] for field in
                        ("status", "progress", "stage", "error", "path")}
        job = {"status": "preparing", "progress": 0, "error": "", "path": "",
               "stage": "Preparing playback", "cancelled": False, "process": None,
               "fingerprint": _fingerprint(source, studio_sound, max_height)}
        _jobs[key] = job
        worker = threading.Thread(target=_prepare, args=(source, job, studio_sound, max_height), daemon=True)
        job["thread"] = worker
        worker.start()
    return {"status": "preparing", "progress": 0, "stage": job["stage"]}


def preview_status(video_path: str, studio_sound: bool = False, max_height: int = 720) -> dict:
    if max_height not in (360, 480, 720, 1080):
        raise ValueError("Unsupported preview quality")
    source = Path(video_path).expanduser().resolve()
    cached = _cached(source, studio_sound, max_height)
    if cached:
        return {"status": "ready", "progress": 100, "path": str(cached)}
    with _lock:
        job = _jobs.get(_job_key(source, studio_sound, max_height))
        if not job:
            return {"status": "idle", "progress": 0}
        return {field: job[field] for field in ("status", "progress", "stage", "error", "path")}


def cancel_preview(video_path: str, studio_sound: bool | None = None) -> None:
    source = Path(video_path).expanduser().resolve()
    variants = (False, True) if studio_sound is None else (studio_sound,)
    for variant, height in ((variant, height) for variant in variants for height in (360, 480, 720, 1080)):
        with _lock:
            job = _jobs.get(_job_key(source, variant, height))
            if not job or job["status"] != "preparing":
                continue
            job["cancelled"] = True
            process = job["process"]
            worker = job["thread"]
        if process and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        worker.join(timeout=5)
        job["status"] = "cancelled"
