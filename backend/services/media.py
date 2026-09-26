"""Fetch direct public media URLs selected by the user."""

import ipaddress
import json
import os
import socket
import subprocess
import uuid
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests

EXTENSIONS = {
    "image": {".jpg", ".jpeg", ".png", ".webp", ".bmp"},
    "broll": {".mp4", ".mov", ".webm", ".mkv", ".avi"},
    "music": {".mp3", ".wav", ".m4a", ".flac", ".ogg", ".aac"},
}
MEDIA_DIR = Path.home() / "Edity" / "Media"
MAX_BYTES = 150 * 1024 * 1024


def _check_public_https(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Use a direct public HTTPS media URL")
    if parsed.port not in (None, 443):
        raise ValueError("Media URLs must use the standard HTTPS port")
    for address in socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM):
        if not ipaddress.ip_address(address[4][0]).is_global:
            raise ValueError("Private or local media hosts are not allowed")


def download_media(url: str, kind: str) -> str:
    if kind not in EXTENSIONS:
        raise ValueError("Unknown media type")
    session = requests.Session()
    session.trust_env = False
    response = None
    for _ in range(5):
        _check_public_https(url)
        response = session.get(url, stream=True, timeout=(10, 60), allow_redirects=False)
        if response.is_redirect:
            url = urljoin(url, response.headers["Location"])
            response.close()
            continue
        break
    if response is None or response.is_redirect:
        raise ValueError("Too many media redirects")
    response.raise_for_status()
    if response.status_code != 200:
        response.close()
        raise ValueError("The URL did not return a media file")
    if int(response.headers.get("Content-Length", "0") or 0) > MAX_BYTES:
        response.close()
        raise ValueError("Media file exceeds 150 MB")
    extension = Path(urlparse(url).path).suffix.lower()
    if extension not in EXTENSIONS[kind]:
        response.close()
        raise ValueError("The URL must point directly to a supported media file")
    mime = response.headers.get("Content-Type", "").lower()
    if mime and not (mime.startswith("image/") if kind == "image" else mime.startswith("video/") if kind == "broll" else mime.startswith("audio/")):
        response.close()
        raise ValueError("The URL did not return the expected media type")
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    target = MEDIA_DIR / f"{uuid.uuid4().hex}{extension}"
    total = 0
    try:
        with target.open("wb") as output:
            for chunk in response.iter_content(65536):
                total += len(chunk)
                if total > MAX_BYTES:
                    raise ValueError("Media file exceeds 150 MB")
                output.write(chunk)
    except Exception:
        target.unlink(missing_ok=True)
        raise
    finally:
        response.close()
    return str(target)


def render_media(output_path: str, items: list[dict]) -> None:
    """Overlay images/video and mix music on the already-cut export."""
    if not items:
        return
    source = Path(output_path).resolve()
    info = subprocess.run(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(source)],
                          capture_output=True, text=True, check=True)
    metadata = json.loads(info.stdout)
    duration = float(metadata["format"]["duration"])
    video = next((s for s in metadata["streams"] if s["codec_type"] == "video"), None)
    audio = next((s for s in metadata["streams"] if s["codec_type"] == "audio"), None)
    if not video or not audio:
        raise ValueError("Media overlays require a video with audio")
    width, height = int(video["width"]), int(video["height"])
    cmd = ["ffmpeg", "-y", "-i", str(source)]
    filters = []
    video_label, audio_label = "0:v", "0:a"
    music_labels = []
    for index, item in enumerate(items, 1):
        kind = item["type"]
        path = Path(item["path"]).expanduser().resolve()
        if kind not in EXTENSIONS or path.suffix.lower() not in EXTENSIONS[kind] or not path.is_file():
            raise ValueError(f"Invalid or missing {kind} media file: {path}")
        start, end = float(item["start"]), min(float(item["end"]), duration)
        source_start = float(item.get("sourceStart", 0))
        if start < 0 or end <= start:
            raise ValueError("Media timing must fit inside the exported video")
        if source_start < 0:
            raise ValueError("Media source start must be non-negative")
        if kind == "image":
            cmd += ["-loop", "1", "-framerate", "25", "-i", str(path)]
        else:
            cmd += ["-stream_loop", "-1", "-i", str(path)]
        if kind in {"image", "broll"}:
            trim = f"trim=start={source_start}:duration={end-start}," if kind == "broll" else ""
            filters.append(
                f"[{index}:v]{trim}scale={width}:{height}:force_original_aspect_ratio=decrease,"
                f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,"
                f"setpts=PTS-STARTPTS+{start}/TB[asset{index}]"
            )
            filters.append(
                f"[{video_label}][asset{index}]overlay=eof_action=pass:repeatlast=0:"
                f"enable='between(t,{start},{end})'[v{index}]"
            )
            video_label = f"v{index}"
        else:
            volume = float(item.get("volume", 0.3))
            if not 0 <= volume <= 2:
                raise ValueError("Music volume must be between 0 and 2")
            filters.append(
                f"[{index}:a]atrim=start={source_start}:duration={end-start},asetpts=PTS-STARTPTS,"
                f"volume={volume},adelay={round(start*1000)}:all=1[m{index}]"
            )
            music_labels.append(f"[m{index}]")
    if music_labels:
        filters.append(f"[{audio_label}]{''.join(music_labels)}amix=inputs={len(music_labels)+1}:duration=first:dropout_transition=0[aout]")
        audio_label = "aout"
    temporary = source.with_name(f"{source.stem}.edity-media-{uuid.uuid4().hex}{source.suffix}")
    codecs = ["-c:v", "libvpx-vp9", "-c:a", "libopus"] if source.suffix.lower() == ".webm" else ["-c:v", "libx264", "-crf", "18", "-c:a", "aac", "-b:a", "192k"]
    cmd += ["-filter_complex", ";".join(filters), "-map", f"[{video_label}]" if video_label != "0:v" else "0:v",
            "-map", f"[{audio_label}]" if audio_label != "0:a" else "0:a", *codecs,
            "-t", str(duration), str(temporary)]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if result.returncode:
            raise RuntimeError(f"Media render failed: {result.stderr[-1500:]}")
        os.replace(temporary, source)
    finally:
        temporary.unlink(missing_ok=True)
