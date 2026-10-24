"""Export endpoint for video cutting and rendering."""

import logging
import tempfile
import os
import shutil
from pathlib import Path
import threading
from uuid import uuid4
from typing import List, Optional, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.video_editor import export_stream_copy, export_reencode, export_reencode_with_subs
from services.media import render_media
from services.caption_generator import generate_srt, generate_ass, save_captions

logger = logging.getLogger(__name__)
router = APIRouter()
_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()


class SegmentModel(BaseModel):
    start: float
    end: float


class ExportWordModel(BaseModel):
    word: str
    start: float
    end: float
    confidence: float = 0.0


class MediaItemModel(BaseModel):
    type: Literal["image", "broll", "music"]
    path: str
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    sourceStart: float = Field(default=0, ge=0)
    volume: float = Field(default=0.3, ge=0, le=2)


class ExportRequest(BaseModel):
    input_path: str
    output_path: str
    keep_segments: List[SegmentModel]
    mode: str = "fast"
    resolution: str = "1080p"
    format: str = "mp4"
    enhanceAudio: bool = False
    captions: str = "none"
    words: Optional[List[ExportWordModel]] = None
    deleted_indices: Optional[List[int]] = None
    media_items: List[MediaItemModel] = Field(default_factory=list)


def _mux_audio(video_path: str, audio_path: str, output_path: str) -> str:
    """Replace video's audio track with cleaned audio using FFmpeg."""
    import subprocess
    audio_codec = "libopus" if os.path.splitext(output_path)[1].lower() == ".webm" else "aac"
    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-i", audio_path,
        "-c:v", "copy",
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-c:a", audio_codec,
        "-b:a", "192k",
        "-shortest",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Audio mux failed: {result.stderr[-300:]}")
    return output_path


def _replace_export_from_temporary(source: str, destination: str) -> None:
    """Replace an export safely even when Studio Sound used another drive."""
    target = Path(destination)
    with tempfile.NamedTemporaryFile(dir=target.parent, prefix=f".{target.stem}-",
                                     suffix=target.suffix, delete=False) as staged:
        staged_path = Path(staged.name)
    try:
        shutil.copyfile(source, staged_path)
        os.replace(staged_path, target)
    finally:
        staged_path.unlink(missing_ok=True)


def _perform_export(req: ExportRequest, on_progress=None):
    try:
        def progress(percent: int, stage: str):
            if on_progress:
                on_progress(percent, stage)

        if os.path.normcase(os.path.abspath(req.input_path)) == os.path.normcase(os.path.abspath(req.output_path)):
            raise ValueError("Export to a different file so the source video stays intact")
        segments = [{"start": s.start, "end": s.end} for s in req.keep_segments]

        if not segments:
            raise HTTPException(status_code=400, detail="No segments to export")

        final_duration = sum(max(0, segment["end"] - segment["start"]) for segment in segments)
        for item in req.media_items:
            if not item.start < item.end <= final_duration + 0.1:
                raise ValueError("Media timing must fit inside the video after cuts")

        use_stream_copy = req.mode == "fast" and len(segments) == 1 and not req.deleted_indices
        needs_reencode_for_subs = req.captions == "burn-in"

        # Burn-in captions require re-encode
        if needs_reencode_for_subs:
            use_stream_copy = False

        words_dicts = [w.model_dump() for w in req.words] if req.words else []
        deleted_set = set(req.deleted_indices or [])

        # Generate ASS file for burn-in
        ass_path = None
        if req.captions == "burn-in" and words_dicts:
            ass_content = generate_ass(words_dicts, deleted_set)
            tmp = tempfile.NamedTemporaryFile(suffix=".ass", delete=False, mode="w", encoding="utf-8")
            tmp.write(ass_content)
            tmp.close()
            ass_path = tmp.name

        try:
            progress(2, "Preparing video")
            if use_stream_copy:
                output = export_stream_copy(req.input_path, req.output_path, segments)
                progress(72 if req.enhanceAudio else 90, "Video encoded")
            elif ass_path:
                output = export_reencode_with_subs(
                    req.input_path,
                    req.output_path,
                    segments,
                    ass_path,
                    resolution=req.resolution,
                    format_hint=req.format,
                    on_progress=lambda value: progress(round(value * (0.70 if req.enhanceAudio else 0.88)),
                                                       "Encoding video"),
                )
            else:
                output = export_reencode(
                    req.input_path,
                    req.output_path,
                    segments,
                    resolution=req.resolution,
                    format_hint=req.format,
                    on_progress=lambda value: progress(round(value * (0.70 if req.enhanceAudio else 0.88)),
                                                       "Encoding video"),
                )
        finally:
            if ass_path and os.path.exists(ass_path):
                os.unlink(ass_path)

        # Audio enhancement: clean, then mux back into the exported video
        if req.enhanceAudio:
            from services.audio_cleaner import clean_audio
            progress(72, "Enhancing audio")
            with tempfile.TemporaryDirectory(prefix="edity_audio_") as tmp_dir:
                cleaned_audio = os.path.join(tmp_dir, "cleaned.wav")
                clean_audio(output, cleaned_audio,
                            on_progress=lambda value: progress(72 + round(value * 0.22),
                                                               "Enhancing audio"))
                progress(94, "Adding enhanced audio")
                extension = os.path.splitext(output)[1] or ".mp4"
                muxed_path = os.path.join(tmp_dir, f"studio-sound{extension}")
                _mux_audio(output, cleaned_audio, muxed_path)
                _replace_export_from_temporary(muxed_path, output)
                logger.info("Studio Sound audio enhanced and muxed into %s", output)

        if req.media_items:
            progress(96, "Adding media")
            render_media(output, [item.model_dump() for item in req.media_items])

        # Sidecar SRT: generate and save alongside video
        srt_path = None
        if req.captions == "sidecar" and words_dicts:
            srt_content = generate_srt(words_dicts, deleted_set)
            srt_path = req.output_path.rsplit(".", 1)[0] + ".srt"
            save_captions(srt_content, srt_path)
            logger.info(f"Sidecar SRT saved to {srt_path}")

        result = {"status": "ok", "output_path": output}
        if srt_path:
            result["srt_path"] = srt_path
        progress(100, "Complete")
        return result

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        logger.error(f"Export failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Export error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/export")
def export_video(req: ExportRequest):
    return _perform_export(req)


@router.post("/export/start")
def start_export(req: ExportRequest):
    job_id = uuid4().hex
    with _jobs_lock:
        if any(job["status"] == "running" and job["output_path"] == req.output_path
               for job in _jobs.values()):
            raise HTTPException(status_code=409, detail="This file is already being exported")
        _jobs[job_id] = {"status": "running", "progress": 0, "stage": "Preparing video",
                         "output_path": req.output_path}
        # Keep only recent completed jobs; live jobs remain available to poll.
        completed = [key for key, job in _jobs.items() if job["status"] != "running"]
        for key in completed[:-32]:
            del _jobs[key]

    def update(percent: int, stage: str):
        with _jobs_lock:
            job = _jobs[job_id]
            job["progress"] = max(job["progress"], percent)
            job["stage"] = stage

    def run():
        try:
            result = _perform_export(req, update)
            with _jobs_lock:
                _jobs[job_id].update(status="complete", progress=100, stage="Complete",
                                     output_path=result["output_path"])
        except HTTPException as error:
            with _jobs_lock:
                _jobs[job_id].update(status="error", error=str(error.detail))
        except Exception as error:
            logger.exception("Export job failed")
            with _jobs_lock:
                _jobs[job_id].update(status="error", error=str(error))

    threading.Thread(target=run, name=f"edity-export-{job_id[:8]}", daemon=True).start()
    return {"job_id": job_id}


@router.get("/export/status/{job_id}")
def export_status(job_id: str):
    with _jobs_lock:
        job = _jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Export job not found")
        return job.copy()
