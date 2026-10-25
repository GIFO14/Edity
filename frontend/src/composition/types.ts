export type Us = number;
export interface NarrationFragment {id:string;clipId:string;startUs:Us;endUs:Us;memberWordIds:string[]}
export interface NarrationArrangement {version:1;order:NarrationFragment[];parked:NarrationFragment[];cutClipboard:string[]}
export type AssetKind = 'image' | 'video' | 'audio' | 'font';
export interface Asset {
  id: string; kind: AssetKind; path: string; hash: string; name: string;
  durationUs: Us; width: number; height: number; fps?: { num: number; den: number };
  hasAudio: boolean; hasAlpha: boolean; status: 'ready' | 'missing' | 'failed' | 'preparing';
  previewPath?: string; thumbnailPath?: string; fontFamily?: string; normalizedPath?: string;
  rotation?: number; color?: Record<string,string>;
  provenance?: { source: 'local' | 'web'; url?: string; pageUrl?: string; license?: string };
}
export interface Transform {
  x: number; y: number; width: number; height: number; scaleX: number; scaleY: number;
  pivotX: number; pivotY: number; rotation: number; pitch: number; yaw: number; opacity: number;
  fit: 'contain' | 'cover' | 'stretch'; crop: { left: number; right: number; top: number; bottom: number };
}
export type Placement =
  | { kind: 'timeline'; startUs: Us; endUs: Us; ranges?:Array<{startUs:Us;endUs:Us}>|null }
  | { kind: 'project'; startOffsetUs: Us; endOffsetUs: Us }
  | { kind: 'source'; clipId: string; startUs: Us; endUs: Us; startOffsetUs?: Us; endOffsetUs?: Us }
  | { kind: 'speech'; startWordId: string; endWordId: string; startOffsetUs: Us; endOffsetUs: Us;
      memberWordIds?:string[];
      fallbackClock?:'clip-local'|'legacy-global';
      timingBasis?:'auto'|'acoustic'|'transcript';
      endAtCutUs?:Us;
      fallback: { clipId: string; startUs: Us; endUs: Us } };
export interface PresetInstance { presetId: string; presetVersion: number; params: Record<string, number | string | boolean>; seed?: number }
export interface TextStyle {
  fontFamily: string; fontAssetId?: string; fontSize: number; fontWeight: number; color: string;
  align: 'left' | 'center' | 'right'; strokeColor: string; strokeWidth: number;
  shadowColor: string; shadowBlur: number; shadowX: number; shadowY: number;
  backgroundColor: string; padding: number; lineHeight: number;
}
export interface AudioSettings {
  gainDb: number; mute: boolean; fadeInUs: Us; fadeOutUs: Us; ducking: boolean;
  bus: 'voice' | 'music' | 'sound' | 'supplemental';
  envelopeWindow?: {offsetUs:Us;durationUs:Us}|null;
}
export interface ColorGrade {
  enabled:boolean; exposure:number; temperature:number; tint:number; contrast:number; saturation:number;
  shadows:number; midtones:number; highlights:number; rolloff:number;
  mask?:{shape:'rectangle'|'ellipse';x:number;y:number;width:number;height:number;feather:number;invert:boolean}|null;
}
export interface ColorGradePreset {id:string;name:string;revision:number;version:1;grade:ColorGrade}
export interface Element {
  id: string; kind: 'base' | 'image' | 'video' | 'text' | 'audio'; trackId: string; order: number;
  label: string; enabled: boolean; createdBy: 'manual' | 'ai' | 'migration';
  placement: Placement; transform: Transform; presets: PresetInstance[];
  assetId?: string; text?: string; textStyle?: TextStyle; audio?: AudioSettings;
  sourceInUs: Us; endPolicy: 'hold' | 'loop' | 'trim';
  contentWindow?: {offsetUs:Us;durationUs:Us}|null;
  matteColor?:string;
  colorGrade?:ColorGrade|null;
}
export interface Transition {
  id: string; fromId: string; toId: string; atUs: Us; durationUs: Us;
  alignment: 'center' | 'before' | 'after'; preset: PresetInstance;
  sourceAnchor?: { clipId: string; sourceUs: Us };
}
export interface CompositionDocument {
  version: 2; canvas: { width: number; height: number; fps: { num: number; den: number }; background: string };
  assets: Record<string, Asset>; tracks: Array<{ id: string; name: string; kind: 'visual' | 'audio'; order: number; muted: boolean }>;
  elements: Record<string, Element>; transitions: Record<string, Transition>;
  presetVariants: Record<string, { name: string; preset: PresetInstance }>;
  buses: Record<AudioSettings['bus'], { gainDb: number; mute: boolean }>;
  masterGainDb: number;
  sourceGrades?:Record<string,ColorGrade>;
}
export interface CutManifest {
  wordTimings?:Record<string,{startUs:Us;endUs:Us;score:number;method:string}>;
  visualCutPointsUs?:Us[];
  visualTiming?:{clock:string;requestedWordIds:string[];unavailableWordIds:string[]};
  removedWordIds?:string[];
  id: string; inputRevision: string; durationUs: Us; keepSegments: Array<{ start: number; end: number }>;
  segments: Array<{ clipId: string; sourceStartUs: Us; sourceEndUs: Us; editStartUs: Us; editEndUs: Us;
    globalSourceStartUs: Us; joinInUs: Us; joinOutUs: Us }>;
}
export interface TimedWord { id?: string; clipId?: string; start: number; end: number; word: string }
export interface ActiveSpan {startUs:Us;endUs:Us;elapsedUs:Us}
export interface ResolvedElement extends Element { startUs: Us; endUs: Us; suppressed: boolean;activeSpans?:ActiveSpan[];activeDurationUs?:Us }
export interface AudioEntry extends AudioSettings { id: string; assetId: string; startUs: Us; endUs: Us;
  sourcePhaseUs?:Us;activeDurationUs?:Us;envelopePhaseUs?:Us;
  sourceInUs: Us; endPolicy: 'hold' | 'loop' | 'trim' }
export interface AudioPlan { sampleRate: 48000; durationUs: Us; entries: AudioEntry[]; masterGainDb: number;
  voiceGainDb: number; voiceMute: boolean; duckEnvelope: Array<{ timeUs: Us; gain: number }> }
export interface RenderPlan {
  version: 2; manifest: CutManifest; document: CompositionDocument; elements: ResolvedElement[];
  transitions: Array<Transition & { startUs: Us; endUs: Us }>; audio: AudioPlan;
}
export interface FrameLayer {
  id: string; element: Element; sourceTimeUs: Us; transform: Transform;
  blur: number; blurAngle: number; radialBlur: number; keyColor: string; keyTolerance: number;
  keySoftness: number; keySpill: number; mirrorEdges: boolean;
  colorGrade?:ColorGrade|null;
  transition?: {group:string;mix:number;offsetX:number;offsetY:number;rotation:number;scale:number;blur:number;angle:number;radial:number;zoomBlur:number};
}
export type Operation =
  | {type:'canvas';canvas:CompositionDocument['canvas']}
  | { type:'sourceGrade';sourceId:string;grade:ColorGrade|null }
  | { type: 'add'; element: Element }
  | { type: 'update'; id: string; changes: Partial<Element> }
  | { type: 'remove'; id: string }
  | { type: 'asset'; asset: Asset }
  | { type: 'transition'; transition: Transition }
  | { type: 'removeTransition'; id: string }
  | { type: 'variant'; id: string; name: string; preset: PresetInstance }
  | { type: 'buses'; buses: CompositionDocument['buses']; masterGainDb: number };
export interface EditTransaction {
  id: string; projectId: string; baseRevision: number; actor: 'manual' | 'ai' | 'migration';
  label: string; groupId?: string; operations: Operation[];
  documentChanges?:Record<string,unknown>;
}
export const us = (seconds: number) => Math.round(seconds * 1_000_000);
export const seconds = (timeUs: Us) => timeUs / 1_000_000;
export const defaultTransform = (): Transform => ({ x: .5, y: .5, width: 1, height: 1, scaleX: 1, scaleY: 1,
  pivotX: .5, pivotY: .5, rotation: 0, pitch: 0, yaw: 0, opacity: 1, fit: 'contain',
  crop: { left: 0, right: 0, top: 0, bottom: 0 } });
export const defaultTextStyle = (): TextStyle => ({ fontFamily: 'Arial', fontSize: 72, fontWeight: 700,
  color: '#ffffff', align: 'center', strokeColor: '#000000', strokeWidth: 3,
  shadowColor: '#000000', shadowBlur: 8, shadowX: 3, shadowY: 4, backgroundColor: '#00000000', padding: 16, lineHeight: 1.2 });
export const emptyComposition = (): CompositionDocument => ({ version: 2,
  canvas: { width: 1920, height: 1080, fps: { num: 30, den: 1 }, background: '#000000' }, assets: {},
  tracks: [{ id: 'base', name: 'Base', kind: 'visual', order: 0, muted: false },
    { id: 'visual', name: 'Visuals', kind: 'visual', order: 1, muted: false },
    { id: 'text', name: 'Text', kind: 'visual', order: 2, muted: false },
    { id: 'music', name: 'Music', kind: 'audio', order: 3, muted: false },
    { id: 'sound', name: 'Sounds', kind: 'audio', order: 4, muted: false }],
  elements: {}, transitions: {}, presetVariants: {}, masterGainDb: 0,
  buses: { voice: { gainDb: 0, mute: false }, music: { gainDb: 0, mute: false },
    sound: { gainDb: 0, mute: false }, supplemental: { gainDb: 0, mute: false } } });
