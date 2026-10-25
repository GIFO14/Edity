"""Media assets chosen for video overlays."""

import json

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from services.media import download_media
from services.media_library import catalog_media, media_index_status, start_media_index
from services.timeline import compose_timeline

router = APIRouter()


class LibraryRequest(BaseModel):
    folders: dict[str, str]


@router.post("/media/library/analyze")
async def analyze_library(req: LibraryRequest):
    try:
        return await run_in_threadpool(start_media_index, req.folders)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/media/library/status")
async def library_status(folders: str | None = None):
    try:
        selected = json.loads(folders) if folders else None
        if selected is not None and not isinstance(selected, dict):
            raise ValueError('Invalid media folders')
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=422, detail='Invalid media folders') from exc
    return media_index_status(selected)


@router.post("/media/library/catalog")
async def library_catalog(req: LibraryRequest):
    try:
        return {"assets": await run_in_threadpool(catalog_media, req.folders)}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


class DownloadRequest(BaseModel):
    url: str
    type: str


class ComposeRequest(BaseModel):
    clip_paths: list[str]
    output_path: str


@router.post("/media/compose-timeline")
async def compose(req: ComposeRequest):
    try:
        return await run_in_threadpool(compose_timeline, req.clip_paths, req.output_path)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/media/download")
async def download(req: DownloadRequest):
    try:
        return {"path": await run_in_threadpool(download_media, req.url, req.type)}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


class InterpolationInfoRequest(BaseModel):
    paths: list[str]

@router.post('/media/interpolation-info')
async def interpolation_info(req: InterpolationInfoRequest):
    from services.frame_interpolation import video_cadence
    if len(req.paths)>100:raise HTTPException(status_code=422,detail='Too many source files')
    try:return {'sources':await run_in_threadpool(lambda:[video_cadence(p) for p in req.paths])}
    except (OSError,ValueError) as error:raise HTTPException(status_code=422,detail=str(error)) from error
