"""Audio processing endpoint (noise reduction / Studio Sound)."""

import logging
import os
import json
import queue
import subprocess
import threading
from functools import lru_cache
from array import array
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field


logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/audio/waveform")
async def audio_waveform(path: str = Query(...), startUs:int=Query(default=0,ge=0),endUs:int|None=Query(default=None,ge=0),bins:int=Query(default=2000,ge=16,le=4096)):
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Audio file not found")
    try:
        from services.waveform import waveform
        stat=os.stat(path)
        return await run_in_threadpool(waveform,path,stat.st_mtime_ns,stat.st_size,startUs,endUs,bins)
    except (OSError, RuntimeError) as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


class AudioCleanRequest(BaseModel):
    input_path: str
    output_path: Optional[str] = None


class SoundWord(BaseModel):
    start: float
    end: float


class SoundEventRequest(BaseModel):
    file_path: str
    words: list[SoundWord] = Field(default_factory=list)


@router.post("/audio/clean")
async def clean_audio_endpoint(req: AudioCleanRequest):
    try:
        from services.audio_cleaner import clean_audio, is_deepfilter_available
        output = await run_in_threadpool(clean_audio, req.input_path, req.output_path or "")
        return {
            "status": "ok",
            "output_path": output,
            "engine": "deepfilternet" if is_deepfilter_available() else "ffmpeg_anlmdn",
        }
    except Exception as e:
        logger.error(f"Audio cleaning failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/audio/capabilities")
async def audio_capabilities():
    from services.audio_cleaner import is_deepfilter_available
    return {
        "deepfilternet_available": is_deepfilter_available(),
        "engine": "DeepFilterNet" if is_deepfilter_available() else "FFmpeg noise reduction",
    }


@router.post("/audio/events/stream")
def sound_events_stream(req: SoundEventRequest):
    """Stream model download and analysis progress followed by timed sound events."""
    from fastapi.responses import StreamingResponse

    events: queue.Queue[dict | None] = queue.Queue()

    def worker() -> None:
        try:
            from services.sound_events import detect_sound_events
            result = detect_sound_events(req.file_path, [word.model_dump() for word in req.words], events.put)
            events.put({"type": "result", "data": result})
        except Exception as exc:
            logger.exception("Sound event detection failed")
            events.put({"type": "error", "detail": str(exc)})
        finally:
            events.put(None)

    def stream():
        threading.Thread(target=worker, daemon=True, name="edity-sound-events").start()
        while (event := events.get()) is not None:
            yield json.dumps(event, ensure_ascii=False) + "\n"

    return StreamingResponse(stream(), media_type="application/x-ndjson")
