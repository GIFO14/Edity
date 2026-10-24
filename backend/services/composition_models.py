"""Validated plans/data only. Visual evaluation lives in the shared TS runtime."""
import json
from pathlib import Path
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

Us = Annotated[int, Field(strict=True, ge=0, le=9_007_199_254_740_991)]
SignedUs = Annotated[int, Field(strict=True, ge=-9_007_199_254_740_991, le=9_007_199_254_740_991)]
class DataModel(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False, strict=True)

class Rational(DataModel):
    num: int = Field(ge=1, le=240000)
    den: int = Field(ge=1, le=10000)
class MediaFrameRate(DataModel):
    # Recorded/VFR files can use large exact fractions even near 30 or 60 fps.
    # Preserve probe metadata; the export canvas retains its separate limits.
    num: int = Field(ge=1, le=9_007_199_254_740_991)
    den: int = Field(ge=1, le=9_007_199_254_740_991)
class Canvas(DataModel):
    width: int = Field(ge=16, le=7680)
    height: int = Field(ge=16, le=4320)
    fps: Rational
    background: str
class Crop(DataModel):
    left: float = Field(ge=0, lt=1)
    right: float = Field(ge=0, lt=1)
    top: float = Field(ge=0, lt=1)
    bottom: float = Field(ge=0, lt=1)
    @model_validator(mode='after')
    def visible(self):
        if self.left+self.right >= 1 or self.top+self.bottom >= 1:
            raise ValueError('Crop removes entire image')
        return self
class Transform(DataModel):
    x: float = Field(ge=-1e9, le=1e9)
    y: float = Field(ge=-1e9, le=1e9)
    width: float = Field(gt=0, le=100)
    height: float = Field(gt=0, le=100)
    scaleX: float = Field(ge=.001, le=100)
    scaleY: float = Field(ge=.001, le=100)
    pivotX: float
    pivotY: float
    rotation: float
    pitch: float = Field(ge=-89, le=89)
    yaw: float = Field(ge=-89, le=89)
    opacity: float = Field(ge=0, le=1)
    fit: Literal['contain','cover','stretch']
    crop: Crop
class SourceInterval(DataModel):
    clipId: str
    startUs: Us
    endUs: Us
class TimelineRange(DataModel):
    startUs: Us
    endUs: Us
class Placement(DataModel):
    kind: Literal['timeline','project','source','speech']
    ranges: list[TimelineRange] | None = None
    startUs: Us | None = None
    endUs: Us | None = None
    startOffsetUs: SignedUs = 0
    endOffsetUs: SignedUs = 0
    clipId: str | None = None
    startWordId: str | None = None
    endWordId: str | None = None
    fallback: SourceInterval | None = None
    memberWordIds: list[str] | None = Field(default=None,min_length=1,max_length=100000)
    fallbackClock: Literal['clip-local','legacy-global'] | None = None
    timingBasis: Literal['auto','acoustic','transcript'] = 'auto'
    endAtCutUs: Us = Field(default=0, le=1_000_000)
    @model_validator(mode='after')
    def interval(self):
        if self.kind != 'speech' and (self.timingBasis != 'auto' or self.endAtCutUs):
            raise ValueError('Acoustic timing and cut extension require speech placement')
        if self.kind in ('timeline','source') and (self.startUs is None or self.endUs is None or self.endUs <= self.startUs):
            raise ValueError('Empty element interval')
        if self.kind == 'source' and not self.clipId:
            raise ValueError('Source anchor needs a clip ID')
        if self.kind == 'speech' and (not self.startWordId or not self.endWordId or not self.fallback or self.fallback.endUs <= self.fallback.startUs):
            raise ValueError('Speech anchor needs word IDs and a fallback interval')
        if self.memberWordIds is not None and (self.kind!='speech' or len(set(self.memberWordIds))!=len(self.memberWordIds) or self.startWordId not in self.memberWordIds or self.endWordId not in self.memberWordIds):
            raise ValueError('Speech members must be unique and contain the original endpoints')
        return self
class Preset(DataModel):
    presetId: str
    presetVersion: int
    params: dict[str, float | str | bool]
    seed: int | None = None
    @model_validator(mode='after')
    def supported(self):
        registry_path = Path(__file__).resolve().parents[2] / 'shared' / 'preset-registry.json'
        if not registry_path.exists():
            registry_path = Path(__file__).resolve().parents[3] / 'shared' / 'preset-registry.json'
        registry = json.loads(registry_path.read_text(encoding='utf-8'))
        definition = registry.get(self.presetId)
        if not definition or self.presetVersion != definition['version']:
            raise ValueError(f'Unavailable preset: {self.presetId}')
        for key, value in self.params.items():
            control = definition['controls'].get(key)
            if not control:
                raise ValueError(f'Unknown preset parameter: {key}')
            default = control['default']
            if isinstance(default, (int, float)) and not isinstance(default, bool):
                if isinstance(value, bool) or not isinstance(value, (int, float)) or not control['min'] <= value <= control['max']:
                    raise ValueError(f'Invalid parameter: {key}')
            elif type(value) is not type(default):
                raise ValueError(f'Invalid parameter type: {key}')
        return self
class TextStyle(DataModel):
    fontFamily: str
    fontAssetId: str | None = None
    fontSize: float = Field(ge=1, le=1000)
    fontWeight: int = Field(ge=100, le=1000)
    color: str
    align: Literal['left','center','right']
    strokeColor: str
    strokeWidth: float = Field(ge=0, le=100)
    shadowColor: str
    shadowBlur: float = Field(ge=0, le=200)
    shadowX: float
    shadowY: float
    backgroundColor: str
    padding: float = Field(ge=0, le=500)
    lineHeight: float = Field(ge=.5, le=4)
class ContentWindow(DataModel):
    offsetUs: Us
    durationUs: Annotated[int, Field(strict=True, gt=0)]
class AudioSettings(DataModel):
    gainDb: float = Field(ge=-96, le=24)
    mute: bool
    fadeInUs: Us
    fadeOutUs: Us
    ducking: bool
    bus: Literal['voice','music','sound','supplemental']
    envelopeWindow: ContentWindow | None = None
class Provenance(DataModel):
    source: Literal['local','web']
    url: str | None = None
    pageUrl: str | None = None
    license: str | None = None
class Asset(DataModel):
    id: str
    kind: Literal['image','video','audio','font']
    path: str
    hash: str
    name: str
    durationUs: Us
    width: int = Field(ge=0, le=16384)
    height: int = Field(ge=0, le=16384)
    fps: MediaFrameRate | None = None
    hasAudio: bool
    hasAlpha: bool
    status: Literal['ready','missing','failed','preparing']
    previewPath: str | None = None
    thumbnailPath: str | None = None
    fontFamily: str | None = None
    normalizedPath: str | None = None
    rotation: float | None = None
    color: dict[str,str] | None = None
    provenance: Provenance | None = None
class GradeMask(DataModel):
    shape: Literal['rectangle','ellipse'] = 'ellipse'
    x: float = Field(default=.5,ge=0,le=1)
    y: float = Field(default=.5,ge=0,le=1)
    width: float = Field(default=.5,gt=0,le=2)
    height: float = Field(default=.5,gt=0,le=2)
    feather: float = Field(default=.1,ge=0,le=1)
    invert: bool = False
class ColorGrade(DataModel):
    enabled: bool = True
    exposure: float = Field(default=0,ge=-5,le=5)
    temperature: float = Field(default=0,ge=-1,le=1)
    tint: float = Field(default=0,ge=-1,le=1)
    contrast: float = Field(default=1,ge=0,le=3)
    saturation: float = Field(default=1,ge=0,le=3)
    shadows: float = Field(default=0,ge=-1,le=1)
    midtones: float = Field(default=0,ge=-1,le=1)
    highlights: float = Field(default=0,ge=-1,le=1)
    rolloff: float = Field(default=0,ge=0,le=1)
    mask: GradeMask | None = None
class Element(DataModel):
    id: str
    kind: Literal['base','image','video','text','audio']
    trackId: str
    order: int
    label: str
    enabled: bool
    createdBy: Literal['manual','ai','migration']
    placement: Placement
    transform: Transform
    presets: list[Preset]
    assetId: str | None = None
    text: str | None = None
    textStyle: TextStyle | None = None
    audio: AudioSettings | None = None
    sourceInUs: Us
    endPolicy: Literal['hold','loop','trim']
    contentWindow: ContentWindow | None = None
    matteColor:str|None=None
    colorGrade: ColorGrade | None = None
class Track(DataModel):
    id: str
    name: str
    kind: Literal['visual','audio']
    order: int
    muted: bool
class SourceAnchor(DataModel):
    clipId: str
    sourceUs: Us
class Transition(DataModel):
    id: str
    fromId: str
    toId: str
    atUs: Us
    durationUs: Annotated[int, Field(strict=True, gt=0)]
    alignment: Literal['center','before','after']
    preset: Preset
    sourceAnchor: SourceAnchor | None = None
class Variant(DataModel):
    name: str
    preset: Preset
class Bus(DataModel):
    gainDb: float = Field(ge=-96, le=24)
    mute: bool
class Composition(DataModel):
    version: Literal[2]
    canvas: Canvas
    assets: dict[str, Asset]
    tracks: list[Track]
    elements: dict[str, Element]
    transitions: dict[str, Transition]
    presetVariants: dict[str, Variant]
    buses: dict[Literal['voice','music','sound','supplemental'],Bus]
    masterGainDb: float = Field(ge=-96, le=6)
    sourceGrades: dict[str,ColorGrade] = Field(default_factory=dict,max_length=10000)
    @model_validator(mode='after')
    def references(self):
        tracks={t.id:t for t in self.tracks}
        if any(not k or k in ('__proto__','constructor','prototype') for k in self.sourceGrades):raise ValueError('Invalid grading source')
        if len(tracks)!=len(self.tracks): raise ValueError('Duplicate track ID')
        for key, asset in self.assets.items():
            if key!=asset.id or not asset.path or not key or key in ('__proto__','constructor','prototype'): raise ValueError('Invalid asset ID/path')
        for key, element in self.elements.items():
            if key!=element.id or element.trackId not in tracks: raise ValueError('Invalid element/track reference')
            if element.colorGrade is not None and element.kind in ('audio','text'):raise ValueError('Grade only video/image layers')
            if (element.kind=='audio')!=(tracks[element.trackId].kind=='audio'): raise ValueError('Incompatible track')
            if element.kind=='text':
                if element.text is None or not element.textStyle: raise ValueError('Invalid text')
                if element.textStyle.fontAssetId and (element.textStyle.fontAssetId not in self.assets or self.assets[element.textStyle.fontAssetId].kind!='font'):raise ValueError('Missing font asset')
            elif element.assetId not in self.assets: raise ValueError('Missing element asset')
            if element.assetId in self.assets:
                kind=self.assets[element.assetId].kind
                if element.kind=='image' and kind!='image' or element.kind in ('base','video') and kind!='video' or element.kind=='audio' and kind not in ('audio','video'):
                    raise ValueError('Incompatible asset')
        for key, transition in self.transitions.items():
            if key!=transition.id or transition.fromId not in self.elements or transition.toId not in self.elements:
                raise ValueError('Broken transition reference')
        if set(self.buses)!={'voice','music','sound','supplemental'}: raise ValueError('Missing audio bus')
        return self
class AudioEntry(AudioSettings):
    gainDb:float=Field(ge=-192,le=48)
    id: str
    assetId: str
    startUs: Us
    endUs: Us
    sourceInUs: Us
    sourcePhaseUs: Us = 0
    envelopePhaseUs: Us | None = None
    activeDurationUs: Us | None = None
    endPolicy: Literal['hold','loop','trim']
class EnvelopePoint(DataModel):
    timeUs: Us
    gain: float = Field(ge=0, le=1)
class AudioPlan(DataModel):
    sampleRate: Literal[48000]
    durationUs: Us
    entries: list[AudioEntry]
    masterGainDb: float
    voiceGainDb: float
    voiceMute: bool
    duckEnvelope: list[EnvelopePoint]
