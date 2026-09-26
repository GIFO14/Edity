"""Transcription endpoints with optional live chunk progress."""

import json
import logging
import queue
import threading
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from pydantic import BaseModel


logger = logging.getLogger(__name__)
router = APIRouter()


class TranscribeRequest(BaseModel):
    file_path: str
    model: str = "medium"
    engine: str = "crisper"
    language: Optional[str] = None
    use_gpu: bool = True
    use_cache: bool = True
    diarize: bool = False
    hf_token: Optional[str] = None
    num_speakers: Optional[int] = None


@router.post("/transcribe/stream")
def transcribe_stream(req: TranscribeRequest):
    """Stream newline-delimited JSON so the editor can show real progress."""
    events: queue.Queue[dict | None] = queue.Queue()

    def worker() -> None:
        try:
            if req.engine == "crisper":
                from services.verbatim_transcription import transcribe_verbatim
                result = transcribe_verbatim(
                    req.file_path, req.model, req.language or "ca", req.use_cache,
                    progress_callback=events.put,
                )
            elif req.engine == "whisperx":
                from services.transcription import transcribe_audio
                events.put({"type": "progress", "message": "Loading WhisperX and preparing audio",
                            "progress": 5, "current": 0, "total": 1})
                result = transcribe_audio(
                    file_path=req.file_path, model_name=req.model,
                    use_gpu=req.use_gpu, use_cache=req.use_cache, language=req.language,
                )
                events.put({"type": "progress", "message": "WhisperX transcription complete",
                            "progress": 100, "current": 1, "total": 1})
            else:
                raise ValueError("Unknown transcription engine")
            events.put({"type": "result", "data": result})
        except Exception as exc:
            logger.exception("Transcription failed")
            events.put({"type": "error", "detail": str(exc)})
        finally:
            events.put(None)

    def stream():
        threading.Thread(target=worker, daemon=True, name="edity-transcription").start()
        while (event := events.get()) is not None:
            yield json.dumps(event, ensure_ascii=False) + "\n"

    return StreamingResponse(stream(), media_type="application/x-ndjson")


@router.post("/transcribe")
async def transcribe(req: TranscribeRequest):
    try:
        if req.engine == "crisper":
            from services.verbatim_transcription import transcribe_verbatim
            return await run_in_threadpool(transcribe_verbatim, req.file_path, req.model, req.language or "ca", req.use_cache)
        if req.engine != "whisperx":
            raise ValueError("Unknown transcription engine")
        from services.transcription import transcribe_audio
        result = await run_in_threadpool(transcribe_audio,
            file_path=req.file_path,
            model_name=req.model,
            use_gpu=req.use_gpu,
            use_cache=req.use_cache,
            language=req.language,
        )

        if req.diarize and req.hf_token:
            from services.diarization import diarize_and_label
            result = diarize_and_label(
                transcription_result=result,
                audio_path=req.file_path,
                hf_token=req.hf_token,
                num_speakers=req.num_speakers,
                use_gpu=req.use_gpu,
            )

        return result

    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"File not found: {req.file_path}")
    except Exception as e:
        logger.error(f"Transcription failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
