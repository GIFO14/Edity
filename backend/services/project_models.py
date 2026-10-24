"""Project envelopes preserve legacy extensions while validating editable fields."""
from typing import Literal
from pydantic import BaseModel,ConfigDict,Field,model_validator
from .composition_models import Composition,DataModel,Us
from .media_actions import Operation
class Word(BaseModel):
    model_config=ConfigDict(extra='allow',allow_inf_nan=False)
    id:str=Field(min_length=1,max_length=200)
    word:str
    start:float=Field(ge=0)
    end:float=Field(ge=0)
    confidence:float=0
    clipId:str|None=None
    @model_validator(mode='after')
    def interval(self):
        if self.end<self.start:raise ValueError('Reversed word interval')
        return self
class Clip(BaseModel):
    model_config=ConfigDict(extra='allow',allow_inf_nan=False)
    id:str=Field(min_length=1,max_length=200)
    path:str
    name:str
    start:float=Field(ge=0)
    duration:float=Field(ge=0)
class DeletedRange(BaseModel):
    model_config=ConfigDict(extra='allow',allow_inf_nan=False)
    id:str
    start:float=Field(ge=0)
    end:float=Field(ge=0)
    wordIndices:list[int]
class NarrationFragment(DataModel):
    id:str=Field(min_length=1,max_length=200)
    clipId:str
    startUs:Us
    endUs:Us
    memberWordIds:list[str]
    @model_validator(mode='after')
    def interval(self):
        if self.endUs<=self.startUs:raise ValueError('Empty narration fragment')
        return self
class NarrationArrangement(DataModel):
    version:Literal[1]
    order:list[NarrationFragment]=Field(max_length=100000)
    parked:list[NarrationFragment]=Field(default_factory=list,max_length=100000)
    cutClipboard:list[str]=Field(default_factory=list)
class ProjectV2(BaseModel):
    model_config=ConfigDict(extra='allow',allow_inf_nan=False)
    version:Literal[2]
    id:str=Field(min_length=1,max_length=100,pattern=r'^[a-zA-Z0-9_-]+$')
    revision:int=Field(ge=0,strict=True)
    videoPath:str
    words:list[Word]
    segments:list[dict]
    clips:list[Clip]
    deletedRanges:list[DeletedRange]
    composition:Composition
    narration:NarrationArrangement|None=None
    createdAt:str
    modifiedAt:str
    @model_validator(mode='after')
    def references(self):
        ids=[w.id for w in self.words]
        if len(set(ids))!=len(ids):raise ValueError('Duplicate word ID')
        clips={c.id for c in self.clips}
        for key in self.composition.sourceGrades:
            if key not in clips and (key not in self.composition.assets or self.composition.assets[key].kind not in ('video','image')):raise ValueError('Unknown grading source')
        if len(clips)!=len(self.clips):raise ValueError('Duplicate clip ID')
        if any(w.clipId and w.clipId not in clips for w in self.words):raise ValueError('Unknown word clip')
        if any(i<0 or i>=len(self.words) for r in self.deletedRanges for i in r.wordIndices):raise ValueError('Unknown deleted word index')
        return self
class Keep(DataModel):
    start:float=Field(ge=0)
    end:float=Field(gt=0)
class ManifestSegment(DataModel):
    clipId:str
    sourceStartUs:Us
    sourceEndUs:Us
    globalSourceStartUs:Us
    editStartUs:Us
    editEndUs:Us
    joinInUs:Us
    joinOutUs:Us
    narrationFragmentId:str|None=None
class CutManifest(DataModel):
    id:str
    inputRevision:str
    durationUs:Us
    keepSegments:list[Keep]
    segments:list[ManifestSegment]
    removedWordIds:list[str]=Field(default_factory=list)
    wordTimings:dict[str,dict]=Field(default_factory=dict)
    visualTiming:dict|None=None
    visualCutPointsUs:list[Us]=Field(default_factory=list)
class InternalOperation(Operation):
    type:Literal['add','update','remove','asset','transition','removeTransition','variant','buses','sourceGrade']
    asset:dict|None=None
    @model_validator(mode='after')
    def required_fields(self):
        if self.type=='asset':
            if self.asset is None:raise ValueError('asset requires asset')
            return self
        return super().required_fields()
class Transaction(DataModel):
    id:str=Field(min_length=1,max_length=200)
    projectId:str
    baseRevision:int=Field(ge=0,strict=True)
    actor:Literal['manual','ai','migration']
    label:str
    groupId:str|None=None
    operations:list[InternalOperation]
    documentChanges:dict=Field(default_factory=dict)
