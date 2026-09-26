"""Compose managed project clips into one continuous editing timeline."""

import json
import os
import subprocess
import time
import uuid
from pathlib import Path


def _probe(path: Path) -> dict:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
        capture_output=True, text=True, check=True, timeout=30,
    )
    data = json.loads(result.stdout)
    video = next((stream for stream in data["streams"] if stream["codec_type"] == "video"), None)
    if not video:
        raise ValueError(f"Clip has no video stream: {path.name}")
    duration = float(data["format"].get("duration") or video.get("duration") or 0)
    if duration <= 0:
        raise ValueError(f"Clip has no valid duration: {path.name}")
    return {"duration": duration, "width": int(video["width"]), "height": int(video["height"]),
            "audio": any(stream["codec_type"] == "audio" for stream in data["streams"])}


def _encode(paths: list[Path], metadata: list[dict], temporary: Path, gpu: bool) -> None:
    width = metadata[0]["width"] - metadata[0]["width"] % 2
    height = metadata[0]["height"] - metadata[0]["height"] % 2
    command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"]
    input_indices = []
    silent_indices = []
    index = 0
    for path, info in zip(paths, metadata):
        command += ["-i", str(path)]
        input_indices.append(index)
        index += 1
        if not info["audio"]:
            command += ["-f", "lavfi", "-t", str(info["duration"]), "-i", "anullsrc=r=48000:cl=stereo"]
            silent_indices.append(index)
            index += 1
        else:
            silent_indices.append(-1)
    filters = []
    concat_inputs = []
    for item, (input_index, silent_index, info) in enumerate(zip(input_indices, silent_indices, metadata)):
        filters.append(
            f"[{input_index}:v:0]fps=30,scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v{item}]"
        )
        audio_source = f"{input_index}:a:0" if silent_index < 0 else f"{silent_index}:a:0"
        filters.append(
            f"[{audio_source}]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
            f"atrim=duration={info['duration']},asetpts=PTS-STARTPTS[a{item}]"
        )
        concat_inputs.append(f"[v{item}][a{item}]")
    filters.append(f"{''.join(concat_inputs)}concat=n={len(paths)}:v=1:a=1[outv][outa]")
    suffix = temporary.suffix.lower()
    if suffix == ".webm":
        video_options = ["-c:v", "libvpx-vp9", "-deadline", "realtime", "-crf", "24", "-b:v", "0"]
        audio_options = ["-c:a", "libopus", "-b:a", "160k"]
        container_options = []
    elif suffix == ".avi":
        video_options = ["-c:v", "mpeg4", "-q:v", "2"]
        audio_options = ["-c:a", "libmp3lame", "-b:a", "192k"]
        container_options = []
    else:
        video_options = (["-c:v", "h264_nvenc", "-preset", "p4", "-cq", "18", "-b:v", "0"] if gpu else
                         ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18"])
        audio_options = ["-c:a", "aac", "-b:a", "192k"]
        container_options = ["-movflags", "+faststart"] if suffix in {".mp4", ".mov"} else []
    command += ["-filter_complex", ";".join(filters), "-map", "[outv]", "-map", "[outa]",
                *video_options, *audio_options, *container_options, str(temporary)]
    result = subprocess.run(command, capture_output=True, text=True, check=False,
                            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    if result.returncode:
        raise RuntimeError(result.stderr[-1500:] or "Could not compose project clips")


def compose_timeline(clip_paths: list[str], output_path: str) -> dict:
    if not clip_paths:
        raise ValueError("A project must contain at least one clip")
    output = Path(output_path).expanduser().resolve()
    project_dir = output.parent.resolve()
    paths = [Path(path).expanduser().resolve() for path in clip_paths]
    for path in paths:
        if not path.is_file():
            raise FileNotFoundError(path)
        relative = path.relative_to(project_dir) if path.is_relative_to(project_dir) else None
        if relative is None:
            raise ValueError("Project clips must be inside the project directory")
        if path == output:
            raise ValueError("Timeline output cannot overwrite a source clip")
    metadata = [_probe(path) for path in paths]
    temporary = output.with_name(f"{output.stem}.timeline-{uuid.uuid4().hex}{output.suffix}")
    try:
        try:
            _encode(paths, metadata, temporary, gpu=True)
        except RuntimeError:
            temporary.unlink(missing_ok=True)
            _encode(paths, metadata, temporary, gpu=False)
        for attempt in range(21):
            try:
                os.replace(temporary, output)
                break
            except PermissionError:
                if attempt >= 20:
                    raise
                time.sleep(0.25)
    finally:
        temporary.unlink(missing_ok=True)
    start = 0.0
    clips = []
    for path, info in zip(paths, metadata):
        clips.append({"path": str(path), "start": round(start, 6), "duration": round(info["duration"], 6)})
        start += info["duration"]
    return {"output_path": str(output), "duration": round(start, 6), "clips": clips}
