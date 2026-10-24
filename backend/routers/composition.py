from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from pydantic import BaseModel, Field
from services import asset_preparation
from services.composition_audio import render_audio
router=APIRouter(prefix='/composition')
@router.get('/fonts')
@router.post('/fonts')
async def fonts():return {'families':await run_in_threadpool(asset_preparation.available_fonts)}
class AssetRequest(BaseModel):
    path:str
    kind:str
    jobId:str=''
class FrameRequest(BaseModel):
    path:str
    timeUs:int=Field(ge=0)
    width:int=Field(ge=1,le=7680)
    height:int=Field(ge=1,le=4320)
    jobId:str=''
class FramesRequest(FrameRequest):
    colorManaged:bool=False
    count:int=Field(default=15,ge=1,le=16)
    fpsNum:int=Field(default=30,ge=1,le=9_007_199_254_740_991)
    fpsDen:int=Field(default=1,ge=1,le=9_007_199_254_740_991)
class LeaseRequest(BaseModel):
    paths:list[str]=Field(max_length=500)
class AudioRequest(BaseModel):
    plan:dict
    assets:dict
    manifest:dict
    voicePath:str=''
    studioSound:bool=False
    startUs:int=0
    endUs:int|None=None
    jobId:str=''
    includeVoice:bool=True
class AITurnRequest(BaseModel):
    context:dict
    results:list=Field(default_factory=list)
    imagePaths:list[str]=Field(default_factory=list)
    jobId:str=''
class AudioGapReviewRequest(BaseModel):
    path:str
    words:list[dict]
    language:str='en'
    jobId:str=''

@router.post('/review-audio-gaps')
async def review_audio_gaps(request: AudioGapReviewRequest):
    from services.audio_gaps import detect_audible_gaps, DETECTOR_VERSION
    try:
        events = await run_in_threadpool(detect_audible_gaps, request.path, request.words,
                                        request.language, request.jobId)
        return {'events': events, 'detectorVersion': DETECTOR_VERSION}
    except Exception as exc:
        raise HTTPException(422, str(exc))
class ActionValidationRequest(BaseModel):
    actions:list=Field(min_length=1,max_length=20)
class CandidateValidationRequest(BaseModel):
    candidates:list=Field(min_length=1,max_length=60)
class SearchRequest(BaseModel):
    query:str=''
    kind:str|None=None
    folders:dict=Field(default_factory=dict)
    jobId:str=''
class ImportRequest(BaseModel):
    url:str
    kind:str
    jobId:str=''
class ReferenceRequest(BaseModel):
    path:str
    pageIndex:int|None=Field(default=None,ge=0)
    startChar:int=Field(default=0,ge=0)
    jobId:str=''
class ResourceInspectionRequest(BaseModel):
    path:str
    timeUs:int|None=Field(default=None,ge=0)
    jobId:str=''
@router.post('/read-reference')
async def read_reference(req:ReferenceRequest):
    from services.ai_references import read_reference
    try:return await run_in_threadpool(read_reference,req.path,req.pageIndex,req.startChar,req.jobId)
    except Exception as e:raise HTTPException(422,str(e)) from e
@router.post('/inspect-resource')
async def inspect_resource(req:ResourceInspectionRequest):
    from services.ai_references import inspect_resource
    try:return await run_in_threadpool(inspect_resource,req.path,req.timeUs,req.jobId)
    except Exception as e:raise HTTPException(422,str(e)) from e
@router.post('/prepare')
async def prepare(req:AssetRequest):
    try:return await run_in_threadpool(asset_preparation.prepare,req.path,req.kind,req.jobId)
    except Exception as e:raise HTTPException(422,str(e)) from e
@router.post('/frame')
async def frame(req:FrameRequest):
    try:return Response(await run_in_threadpool(asset_preparation.frame,req.path,req.timeUs,req.width,req.height,req.jobId),media_type='application/octet-stream')
    except Exception as e:raise HTTPException(422,str(e)) from e
@router.post('/audio')
async def audio(req:AudioRequest):
    try:return {'path':await run_in_threadpool(render_audio,req.plan,req.assets,req.manifest,req.voicePath,req.studioSound,req.startUs,req.endUs,req.jobId,req.includeVoice)}
    except Exception as e:raise HTTPException(422,str(e)) from e
@router.post('/frames')
async def frames(req:FramesRequest):
    try:return Response(await run_in_threadpool(asset_preparation.frames,req.path,req.timeUs,req.width,req.height,req.count,req.fpsNum,req.fpsDen,req.jobId,req.colorManaged),media_type='application/octet-stream')
    except Exception as e:raise HTTPException(422,str(e)) from e
@router.post('/lease')
async def lease(req:LeaseRequest):
    asset_preparation.lease(req.paths);return {'leased':True}
@router.post('/cancel/{job_id}')
async def cancel(job_id:str):
    asset_preparation.cancel(job_id);return {'cancelled':True}
@router.post('/ai-turn')
async def ai_turn(req:AITurnRequest):
    from services.media_actions import ai_turn
    try:return await run_in_threadpool(ai_turn,req.context,req.results,req.jobId,req.imagePaths)
    except Exception as e:raise HTTPException(422,str(e)) from e
@router.post('/validate-actions')
async def validate_actions(req:ActionValidationRequest):
    from services.media_actions import Turn
    try:return Turn.model_validate({'actions':req.actions}).model_dump(exclude_none=True)
    except Exception as e:raise HTTPException(422,str(e)) from e
@router.post('/agent-instructions')
async def agent_instructions():
    from services.media_actions import SYSTEM
    return {'instructions':SYSTEM}
@router.post('/validate-candidates')
async def validate_candidates(req:CandidateValidationRequest):
    from pathlib import Path
    from services.media import _check_public_https
    def validate():
        result=[]
        for candidate in req.candidates:
            if not isinstance(candidate,dict) or candidate.get('kind') not in ('image','video','audio','font'):
                raise ValueError('Candidate needs a supported media kind')
            if not isinstance(candidate.get('name'),str) or not 1<=len(candidate['name'])<=500:
                raise ValueError('Candidate needs a name of 1–500 characters')
            if bool(candidate.get('path'))==bool(candidate.get('url')):
                raise ValueError('Candidate needs exactly one local path or public HTTPS URL')
            value={k:candidate[k] for k in ('name','kind','path','url','pageUrl','license') if k in candidate}
            if candidate.get('path'):
                file=Path(candidate['path'])
                if not file.is_absolute() or not file.is_file():raise ValueError('Candidate path must be an existing absolute file')
                value['path']=str(file.resolve())
            else:
                if candidate['kind']=='font':raise ValueError('Register fonts from local files')
                _check_public_https(candidate['url'])
                if candidate.get('pageUrl'):_check_public_https(candidate['pageUrl'])
            result.append(value)
        return {'candidates':result}
    try:return await run_in_threadpool(validate)
    except Exception as e:raise HTTPException(422,str(e)) from e
@router.post('/search-local')
async def search_local(req:SearchRequest):
    from services.media_actions import local_candidates
    return {'candidates':await run_in_threadpool(local_candidates,req.folders,req.query,req.kind)}
@router.post('/search-web')
async def search_web(req:SearchRequest):
    from services.media_actions import search_web
    try:return {'candidates':await run_in_threadpool(search_web,req.query,req.kind,req.jobId)}
    except Exception as e:raise HTTPException(422,str(e)) from e
@router.post('/download')
async def download(req:ImportRequest):
    from services.media import download_media
    try:return {'path':await run_in_threadpool(download_media,req.url,{'video':'broll','audio':'music'}.get(req.kind,req.kind),req.jobId)}
    except Exception as e:raise HTTPException(422,str(e)) from e
