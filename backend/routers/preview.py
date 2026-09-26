"""Status and lifecycle of seekable preview files."""

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from services.preview import cancel_preview, prepare_preview, preview_status
from services.edited_preview import edited_preview
from services.cut_refinement import refine_keep_segments
from services.playback_audio import prepare_playback_audio
from services.word_boundary_alignment import align_cut_boundaries

router = APIRouter()


class PreviewRequest(BaseModel):
    video_path: str
    studio_sound: bool = False


class CancelPreviewRequest(BaseModel):
    video_path: str
    studio_sound: bool | None = None


class EditedPreviewRequest(PreviewRequest):
    keep_segments: list[dict[str, float]]
    locked_exit_indices: list[int] = Field(default_factory=list)
    locked_entrance_indices: list[int] = Field(default_factory=list)
    late_entrance_indices: list[int] = Field(default_factory=list)


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
        return await run_in_threadpool(prepare_preview, req.video_path, req.studio_sound)
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
    return await run_in_threadpool(preview_status, req.video_path, req.studio_sound)


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
        segments = await run_in_threadpool(refine_keep_segments, req.video_path,
                                           req.keep_segments, req.locked_exit_indices,
                                           req.locked_entrance_indices,
                                           req.late_entrance_indices)
        return {"keep_segments": segments}
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


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
