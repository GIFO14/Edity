"""Export endpoint for video cutting and rendering."""

import logging
import tempfile
import os
from typing import List, Optional, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.video_editor import export_stream_copy, export_reencode, export_reencode_with_subs
from services.media import render_media
from services.caption_generator import generate_srt, generate_ass, save_captions

logger = logging.getLogger(__name__)
router = APIRouter()


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


@router.post("/export")
async def export_video(req: ExportRequest):
    try:
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
            if use_stream_copy:
                output = export_stream_copy(req.input_path, req.output_path, segments)
            elif ass_path:
                output = export_reencode_with_subs(
                    req.input_path,
                    req.output_path,
                    segments,
                    ass_path,
                    resolution=req.resolution,
                    format_hint=req.format,
                )
            else:
                output = export_reencode(
                    req.input_path,
                    req.output_path,
                    segments,
                    resolution=req.resolution,
                    format_hint=req.format,
                )
        finally:
            if ass_path and os.path.exists(ass_path):
                os.unlink(ass_path)

        # Audio enhancement: clean, then mux back into the exported video
        if req.enhanceAudio:
            from services.audio_cleaner import clean_audio
            with tempfile.TemporaryDirectory(prefix="edity_audio_") as tmp_dir:
                cleaned_audio = os.path.join(tmp_dir, "cleaned.wav")
                clean_audio(output, cleaned_audio)
                extension = os.path.splitext(output)[1] or ".mp4"
                muxed_path = os.path.join(tmp_dir, f"studio-sound{extension}")
                _mux_audio(output, cleaned_audio, muxed_path)
                os.replace(muxed_path, output)
                logger.info("Studio Sound audio enhanced and muxed into %s", output)

        if req.media_items:
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
        return result

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        logger.error(f"Export failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Export error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
