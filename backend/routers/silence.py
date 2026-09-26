"""Import-time silence removal."""

import json
import logging
import queue
import subprocess
import threading

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.silence import remove_silence

router = APIRouter()
logger = logging.getLogger(__name__)


class SilenceRequest(BaseModel):
    file_path: str
    preset: str = "personal"
    custom_margin: float | None = None


@router.post("/silence/remove")
async def silence_remove(req: SilenceRequest):
    try:
        return await run_in_threadpool(remove_silence, req.file_path, req.preset, req.custom_margin)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except (RuntimeError, subprocess.TimeoutExpired) as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/silence/remove/stream")
def silence_remove_stream(req: SilenceRequest):
    """Stream Auto-Editor analysis, render and finalization progress."""
    events: queue.Queue[dict | None] = queue.Queue()

    def worker() -> None:
        try:
            result = remove_silence(req.file_path, req.preset, req.custom_margin, events.put)
            events.put({"type": "result", "data": result})
        except Exception as exc:
            logger.exception("Silence removal failed")
            events.put({"type": "error", "detail": str(exc)})
        finally:
            events.put(None)

    def stream():
        threading.Thread(target=worker, daemon=True, name="edity-silence-removal").start()
        while (event := events.get()) is not None:
            yield json.dumps(event, ensure_ascii=False) + "\n"

    return StreamingResponse(stream(), media_type="application/x-ndjson")
