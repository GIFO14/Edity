export interface SilenceRemoval {
  id: string; kind: 'silence-removal'; clipId: string; processedSourceUs: number;
  globalSourceUs: number; originalStartUs: number; originalEndUs: number;
  removedUs: number; marginSecondsPerSide: number | null; editTimesUs: number[] | null; visible: boolean | null;
}
export interface EditBoundaries {
  version: number; sourceClock: string; playbackClock: string; policy: string;
  mapStatus: Array<{clipId: string; status: string}>; silenceRemovals: SilenceRemoval[];
  timelineCuts: Array<{id: string; kind: string; editTimeUs: number; fromSourceUs: number; toSourceUs: number; fromClipId: string; toClipId: string}>;
}
export function editBoundaries(document: {clips?: Array<{id: string; start: number}>}, manifest?: import('../frontend/src/composition/types').CutManifest | null): EditBoundaries;
export interface BaseTimelineSegment {id:string;startUs:number;endUs:number;clipId:string;cutKinds:string[]}
export function baseTimelineSegments(manifest:import('../frontend/src/composition/types').CutManifest|null,boundaries:EditBoundaries,narration?:import('../frontend/src/composition/types').NarrationArrangement|null,clips?:Array<{id:string;start:number}>):BaseTimelineSegment[];
