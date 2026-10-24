import type { CutManifest } from './types';
import { useEditorStore } from '../store/editorStore';
import { getLockedCutBoundaries,getEffectiveCutRanges } from '../lib/cutRanges';
import type {ProjectFile} from '../types/project';
import {narrationManifestClips} from './narration';
import {visualTimingRequest} from './timeMap';
const requests=new Map<string,Promise<CutManifest>>();
export function requestManifest(backendUrl:string,body:Record<string,unknown>):Promise<CutManifest> {
  const key=JSON.stringify([backendUrl,body]);
  if(!requests.has(key)){
    const request=fetch(`${backendUrl}/preview/manifest`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      .then(async response=>{const result=await response.json();if(!response.ok)throw new Error(result.detail||'Could not prepare edit timing');return result as CutManifest;})
      .catch(error=>{requests.delete(key);throw error;});
    requests.set(key,request);if(requests.size>24)requests.delete(requests.keys().next().value!);
  }
  return requests.get(key)!;
}
export function currentManifestRequest(){
  const state=useEditorStore.getState(),keep_segments=state.getKeepSegments(),locks=getLockedCutBoundaries(state.words,state.deletedRanges,keep_segments);
  return {video_path:state.videoPath,keep_segments,clips:narrationManifestClips(state.clips,state.narration),locked_exit_indices:locks.lockedExitIndices,
    locked_entrance_indices:locks.lockedEntranceIndices,late_entrance_indices:locks.lateEntranceIndices,long_late_entrance_indices:locks.longLateEntranceIndices,
    words:state.words,narration_order:state.narration||null,deleted_indices:[...new Set(state.deletedRanges.flatMap(range=>range.wordIndices))],language:state.language||'en',
    ...(state.processing?{join_silence_preset:state.processing.preset,join_custom_margin:state.processing.customMargin}:{})};
}
export function requestCurrentManifest(){return requestManifest(useEditorStore.getState().backendUrl,currentManifestRequest());}
export function requestDocumentManifest(document:ProjectFile,backend:string){
  const base=document.composition?.assets[document.composition.elements.base?.assetId||''];
  // Legacy clips may still report the duration before silence removal.
  const duration=base?.status==='ready'&&base.durationUs&&base.durationUs>0?base.durationUs/1e6:Math.max(0,...(document.clips||[]).map(c=>c.start+c.duration),document.words.at(-1)?.end||0);
  const cuts=getEffectiveCutRanges(document.words,document.deletedRanges,duration,document.soundEvents||[]),keep_segments:Array<{start:number;end:number}>=[];let cursor=0;for(const cut of cuts){if(cut.start>cursor)keep_segments.push({start:cursor,end:cut.start});cursor=Math.max(cursor,cut.end);}if(cursor<duration)keep_segments.push({start:cursor,end:duration});const locks=getLockedCutBoundaries(document.words,document.deletedRanges,keep_segments);
  return requestManifest(backend,{video_path:document.videoPath,keep_segments,clips:narrationManifestClips(document.clips||[],document.narration),words:document.words,narration_order:document.narration||null,deleted_indices:[...new Set(document.deletedRanges.flatMap(r=>r.wordIndices))],language:document.language||'en',locked_exit_indices:locks.lockedExitIndices,locked_entrance_indices:locks.lockedEntranceIndices,late_entrance_indices:locks.lateEntranceIndices,long_late_entrance_indices:locks.longLateEntranceIndices,
    ...visualTimingRequest(document),...(document.processing?{join_silence_preset:document.processing.preset,join_custom_margin:document.processing.customMargin}:{})});
}
