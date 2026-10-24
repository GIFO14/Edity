"""Status and lifecycle of seekable preview files."""

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from typing import Literal

from services.preview import cancel_preview, prepare_preview, preview_status
from services.edited_preview import edited_preview
from services.cut_refinement import refine_keep_segments
from services.playback_audio import prepare_playback_audio
from services.word_boundary_alignment import align_cut_boundaries
from services.cut_manifest import make_manifest
from services.silence import resolve_margin

router = APIRouter()


class PreviewRequest(BaseModel):
    video_path: str
    studio_sound: bool = False
    max_height: Literal[360, 480, 720, 1080] = 720


class CancelPreviewRequest(BaseModel):
    video_path: str
    studio_sound: bool | None = None


class EditedPreviewRequest(PreviewRequest):
    keep_segments: list[dict[str, float]]
    locked_exit_indices: list[int] = Field(default_factory=list)
    locked_entrance_indices: list[int] = Field(default_factory=list)
    late_entrance_indices: list[int] = Field(default_factory=list)
    long_late_entrance_indices: list[int] = Field(default_factory=list)
    words: list[dict] = Field(default_factory=list)
    deleted_indices: list[int] = Field(default_factory=list)
    language: str = "en"
    clips: list[dict] = Field(default_factory=list)
    join_silence_preset: str | None = None
    join_custom_margin: float | None = Field(default=None, ge=0, le=10)
    narration_order: dict | None = None
    visual_word_ids: list[str] = Field(default_factory=list, max_length=1000)
    visual_cut_points: list[int] = Field(default_factory=list, max_length=100000)


class AlignmentWord(BaseModel):
    word: str
    start: float
    end: float


class AlignCutRequest(BaseModel):
    video_path: str
    previous_word: AlignmentWord | None = None
    next_word: AlignmentWord | None = None
    language: str = "en"
    model_size: str = "medium"


@router.post("/preview/prepare")
async def prepare(req: PreviewRequest):
    try:
        return await run_in_threadpool(prepare_preview, req.video_path, req.studio_sound, req.max_height)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/preview/audio")
async def audio(req: PreviewRequest):
    try:
        return await run_in_threadpool(prepare_playback_audio, req.video_path, req.studio_sound)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Could not prepare playback audio: {error}") from error


@router.post("/preview/status")
async def status(req: PreviewRequest):
    return await run_in_threadpool(preview_status, req.video_path, req.studio_sound, req.max_height)


@router.post("/preview/cancel")
async def cancel(req: CancelPreviewRequest):
    await run_in_threadpool(cancel_preview, req.video_path, req.studio_sound)
    return {"status": "cancelled"}


@router.post("/preview/edited")
async def edited(req: EditedPreviewRequest):
    try:
        return await run_in_threadpool(edited_preview, req.video_path, req.studio_sound,
                                       req.keep_segments)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/preview/refine")
async def refine(req: EditedPreviewRequest):
    try:
        manifest = await _manifest(req)
        return {"keep_segments": manifest['keepSegments'], "manifest": manifest}
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


async def _manifest(req: EditedPreviewRequest):
    margin = (resolve_margin(req.join_silence_preset, req.join_custom_margin)
              if req.join_silence_preset is not None else None)
    return await run_in_threadpool(make_manifest, req.video_path, req.keep_segments, req.clips,narration_order=req.narration_order,
                                  locked_exit_indices=req.locked_exit_indices,
                                  locked_entrance_indices=req.locked_entrance_indices,
                                  late_entrance_indices=req.late_entrance_indices,
                                  long_late_entrance_indices=req.long_late_entrance_indices,
                                  words=req.words, deleted_indices=req.deleted_indices, language=req.language,
                                  join_margin_seconds=margin, visual_word_ids=req.visual_word_ids, visual_cut_points=req.visual_cut_points)


@router.post('/preview/manifest')
async def manifest(req: EditedPreviewRequest):
    try:
        return await _manifest(req)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/preview/align-cut")
async def align_cut(req: AlignCutRequest):
    try:
        return await run_in_threadpool(align_cut_boundaries, req.video_path,
                                       req.previous_word.model_dump() if req.previous_word else None,
                                       req.next_word.model_dump() if req.next_word else None,
                                       req.language, req.model_size)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
