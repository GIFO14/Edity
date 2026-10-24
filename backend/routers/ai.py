"""Codex-backed editing, transcript cleanup, and clip suggestions."""

import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from services.ai_provider import (
    AIProvider,
    codex_cli_status,
    clean_transcript_structure,
    create_clip_suggestion,
    detect_filler_words,
    plan_video_edit,
    _find_codex_cli,
)
from services.ai_settings import read_ai_settings, save_ai_model, codex_model_catalog, validate_effort

logger = logging.getLogger(__name__)
router = APIRouter()


class WordInfo(BaseModel):
    index: int
    word: str
    start: Optional[float] = None
    end: Optional[float] = None
    exported_start: Optional[float] = None
    exported_end: Optional[float] = None
    confidence: Optional[float] = None
    speaker: Optional[str] = None
    clipId: Optional[str] = None


class TranscriptCleanupRequest(BaseModel):
    words: List[WordInfo]
    language: str = ""


class MediaAssetInfo(BaseModel):
    id: str
    type: str
    path: str
    name: str
    duration: float = 0
    description: str


class SoundEventInfo(BaseModel):
    id: str
    label: str
    start: float
    end: float
    confidence: float
    overlapsSpeech: bool = False
    markedForRemoval: bool = False


class EditChatRequest(BaseModel):
    message: str
    instructions: str = ""
    words: List[WordInfo]
    deleted_indices: List[int] = Field(default_factory=list)
    model: Optional[str] = None
    history: List[dict] = Field(default_factory=list)
    media_instructions: str = ""
    media_assets: List[MediaAssetInfo] = Field(default_factory=list)
    sound_events: List[SoundEventInfo] = Field(default_factory=list)
    edit_boundaries: dict = Field(default_factory=dict)


@router.post("/ai/edit-chat")
async def edit_chat(req: EditChatRequest):
    try:
        return await run_in_threadpool(plan_video_edit, req.message, req.instructions,
                                       [w.model_dump() for w in req.words], req.deleted_indices, req.model, req.history,
                                       req.media_instructions, [asset.model_dump() for asset in req.media_assets],
                                       [event.model_dump() for event in req.sound_events], req.edit_boundaries)
    except Exception as exc:
        logger.error("Codex edit chat failed: %s", type(exc).__name__)
        detail = str(exc) if isinstance(exc, RuntimeError) else "Codex could not answer. Please try again."
        raise HTTPException(status_code=503, detail=detail) from exc


@router.post("/ai/clean-transcript")
async def clean_transcript(req: TranscriptCleanupRequest):
    """Improve punctuation and paragraph structure without changing timing or word count."""
    try:
        return await run_in_threadpool(
            clean_transcript_structure,
            [word.model_dump(exclude_none=True) for word in req.words],
            req.language,
        )
    except Exception as exc:
        logger.error("Codex transcript cleanup failed: %s", type(exc).__name__)
        detail = str(exc) if isinstance(exc, RuntimeError) else "Codex could not improve the transcript. Please try again."
        raise HTTPException(status_code=503, detail=detail) from exc


class FillerRequest(BaseModel):
    transcript: str
    words: List[WordInfo]
    provider: str = "codex"
    model: Optional[str] = None
    custom_filler_words: Optional[str] = None


class ClipRequest(BaseModel):
    transcript: str
    words: List[WordInfo]
    provider: str = "codex"
    model: Optional[str] = None
    target_duration: int = 60


class AISettingsRequest(BaseModel):
    model: str = Field(default="", max_length=128)
    reasoning_effort: Optional[str] = Field(default=None, max_length=32)


@router.get("/ai/settings")
async def ai_settings(refresh: bool = False):
    catalog = await run_in_threadpool(codex_model_catalog, _find_codex_cli(), refresh)
    return {**read_ai_settings(), **catalog}


@router.put("/ai/settings")
async def update_ai_settings(req: AISettingsRequest):
    try:
        if req.reasoning_effort:
            effort = validate_effort(req.reasoning_effort)
            catalog = await run_in_threadpool(codex_model_catalog, _find_codex_cli())
            selected = next((item for item in catalog["models"] if item["id"] == req.model.strip()), None)
            available = selected["effort_levels"] if selected else [level for item in catalog["models"] for level in item["effort_levels"]]
            if available and effort not in {level["id"] for level in available}:
                raise ValueError("This effort level is unavailable for the selected model. Choose another level or Automatic.")
        return await run_in_threadpool(save_ai_model, req.model, req.reasoning_effort)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/ai/codex-status")
async def codex_status():
    return await run_in_threadpool(codex_cli_status, False)


@router.post("/ai/codex-status/test")
async def test_codex_connection():
    return await run_in_threadpool(codex_cli_status, True)


@router.post("/ai/filler-removal")
async def filler_removal(req: FillerRequest):
    try:
        words_dicts = [w.model_dump() for w in req.words]
        result = detect_filler_words(
            transcript=req.transcript,
            words=words_dicts,
            provider=req.provider,
            model=req.model,
            custom_filler_words=req.custom_filler_words,
        )
        return result
    except Exception as e:
        logger.error(f"Filler detection failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
@router.post("/ai/create-clip")
async def create_clip(req: ClipRequest):
    try:
        words_dicts = [w.model_dump() for w in req.words]
        result = create_clip_suggestion(
            transcript=req.transcript,
            words=words_dicts,
            target_duration=req.target_duration,
            provider=req.provider,
            model=req.model,
        )
        return result
    except Exception as e:
        logger.error(f"Clip creation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
