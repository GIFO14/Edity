import type { CompositionDocument, CutManifest, Placement, TimedWord } from './types';
import { us } from './types';
const maps=new WeakMap<CutManifest,Map<string,CutManifest['segments']>>();
function segments(manifest:CutManifest,clipId?:string){if(!maps.has(manifest)){const map=new Map<string,CutManifest['segments']>();map.set('',[...manifest.segments].sort((a,b)=>a.globalSourceStartUs-b.globalSourceStartUs));for(const segment of manifest.segments){if(!map.has(segment.clipId))map.set(segment.clipId,[]);map.get(segment.clipId)!.push(segment);}for(const [key,list]of map)if(key)list.sort((a,b)=>a.sourceStartUs-b.sourceStartUs);maps.set(manifest,map);}return maps.get(manifest)!.get(clipId||'')||[];}
function search(items:CutManifest['segments'],value:number,start:(s:CutManifest['segments'][number])=>number){let lo=0,hi=items.length;while(lo<hi){const mid=(lo+hi)>>>1;if(start(items[mid])<=value)lo=mid+1;else hi=mid;}return items[lo-1];}
export function sourceToEdit(manifest:CutManifest,sourceUs:number,clipId?:string):number|null{
 const segment=search(segments(manifest,clipId),sourceUs,s=>clipId?s.sourceStartUs:s.globalSourceStartUs);
 if(!segment)return null;const start=clipId?segment.sourceStartUs:segment.globalSourceStartUs,length=segment.sourceEndUs-segment.sourceStartUs;return sourceUs<start+length?segment.editStartUs+sourceUs-start:null;
}
export function editToSource(manifest:CutManifest,editUs:number){
 const s=search(manifest.segments,Math.max(0,editUs),s=>s.editStartUs)||manifest.segments[0];
 return s?{clipId:s.clipId,sourceUs:s.sourceStartUs+Math.min(s.editEndUs-s.editStartUs-1,Math.max(0,editUs-s.editStartUs)),globalSourceUs:s.globalSourceStartUs+Math.min(s.editEndUs-s.editStartUs-1,Math.max(0,editUs-s.editStartUs))}:null;
}
export function resolvePlacementSpans(p:Placement,manifest:CutManifest,words:TimedWord[]) {
  const limit=(a:number,b:number)=>({startUs:Math.max(0,Math.min(manifest.durationUs,a)),endUs:Math.max(0,Math.min(manifest.durationUs,b))});
  if(p.kind==='timeline')return (p.ranges||[{startUs:p.startUs,endUs:p.endUs}]).map(s=>limit(s.startUs,s.endUs)).filter(s=>s.endUs>s.startUs);
  if(p.kind==='project')return [limit(p.startOffsetUs,manifest.durationUs+p.endOffsetUs)].filter(s=>s.endUs>s.startUs);
  const intervals:Array<{startUs:number;endUs:number}>=[];let startOffset=p.startOffsetUs||0,endOffset=p.endOffsetUs||0;
  if(p.kind==='speech'){
    let members=p.memberWordIds;
    if(!members){const a=words.findIndex(w=>w.id===p.startWordId),b=words.findIndex(w=>w.id===p.endWordId);if(a<0||b<a)return [];members=words.slice(a,b+1).flatMap(w=>w.id?[w.id]:[]);}
    const membership=new Set(members),removed=new Set(manifest.removedWordIds||[]);
    const bound=(w:TimedWord,side:'start'|'end')=>{
      const explicit=side==='start'?startOffset:endOffset;
      const acoustic=p.timingBasis!=='transcript'&&(p.timingBasis==='acoustic'||!explicit);
      const actual=w.id?manifest.wordTimings?.[w.id]:undefined;
      return acoustic&&actual?actual[side==='start'?'startUs':'endUs']:us(w[side]);
    };
    if(removed.has(p.startWordId)||!words.some(w=>w.id===p.startWordId))startOffset=0;
    if(removed.has(p.endWordId)||!words.some(w=>w.id===p.endWordId))endOffset=0;
    const ownClips=new Set(words.filter(w=>w.id&&membership.has(w.id)).flatMap(w=>w.clipId?[w.clipId]:[]));
    const mapRange=(a:number,b:number,restrictOwnClips:boolean)=>manifest.segments.filter(s=>(!restrictOwnClips||!ownClips.size||ownClips.has(s.clipId))&&s.globalSourceStartUs<b&&s.globalSourceStartUs+s.sourceEndUs-s.sourceStartUs>a).map(s=>({startUs:s.editStartUs+Math.max(a-s.globalSourceStartUs,0),endUs:s.editStartUs+Math.min(b-s.globalSourceStartUs,s.sourceEndUs-s.sourceStartUs)}));
    let run:Array<TimedWord>=[];
    const flush=()=>{if(run.length){intervals.push(...mapRange(Math.min(...run.map(w=>bound(w,'start'))),Math.max(...run.map(w=>bound(w,'end'))),true));run=[];}};
    for(const word of words){
      if(word.id&&removed.has(word.id))continue;
      const visible=mapRange(bound(word,'start'),bound(word,'end'),false).some(s=>s.endUs>s.startUs);
      if(!visible)continue;
      if(word.id&&membership.has(word.id))run.push(word);else flush();
    }
    flush();
  }else{
    for(const s of manifest.segments)if(s.clipId===p.clipId&&s.sourceStartUs<p.endUs&&s.sourceEndUs>p.startUs)intervals.push({startUs:s.editStartUs+Math.max(0,p.startUs-s.sourceStartUs),endUs:s.editStartUs+Math.min(s.sourceEndUs-s.sourceStartUs,p.endUs-s.sourceStartUs)});
  }
  const merged:Array<{startUs:number;endUs:number}>=[];
  for(const interval of intervals.sort((a,b)=>a.startUs-b.startUs)){const last=merged.at(-1);if(last&&interval.startUs<=last.endUs)last.endUs=Math.max(last.endUs,interval.endUs);else if(interval.endUs>interval.startUs)merged.push({...interval});}
  if(merged.length){merged[0].startUs+=startOffset;merged[merged.length-1].endUs+=endOffset;}
  if(p.kind==='speech'&&p.endAtCutUs&&merged.length&&!(manifest.removedWordIds||[]).includes(p.endWordId)&&words.some(w=>w.id===p.endWordId)){
    const last=merged.at(-1)!,members=new Set(p.memberWordIds||words.slice(words.findIndex(w=>w.id===p.startWordId),words.findIndex(w=>w.id===p.endWordId)+1).map(w=>w.id));
    const cuts=[...manifest.segments.slice(1).filter((s,i)=>{const previous=manifest.segments[i];return s.clipId!==previous.clipId||s.globalSourceStartUs!==previous.globalSourceStartUs+previous.sourceEndUs-previous.sourceStartUs;}).map(s=>s.editStartUs),...(manifest.visualCutPointsUs||[])].filter(t=>t>=last.endUs&&t<=last.endUs+p.endAtCutUs!).sort((a,b)=>a-b);
    // Coalesce cuts closer than one 24fps frame: don't expose a tiny flash
    // between an already baked silence join and an adjacent retake join.
    let cut=cuts[0];for(const candidate of cuts.slice(1)){if(candidate-cut>41667)break;cut=candidate;}
    const removed=new Set(manifest.removedWordIds||[]);
    const crossesForeignSpeech=cut!==undefined&&words.some(w=>{
      if(w.id&&(members.has(w.id)||removed.has(w.id)))return false;
      const a=w.id&&manifest.wordTimings?.[w.id]?.startUs||us(w.start),b=w.id&&manifest.wordTimings?.[w.id]?.endUs||us(w.end);
      return manifest.segments.some(s=>{const start=Math.max(a,s.globalSourceStartUs),end=Math.min(b,s.globalSourceStartUs+s.sourceEndUs-s.sourceStartUs);return end>start&&s.editStartUs+end-s.globalSourceStartUs>last.endUs&&s.editStartUs+start-s.globalSourceStartUs<cut;});
    });
    if(cut!==undefined&&!crossesForeignSpeech)last.endUs=cut;
  }
  return merged.map(s=>limit(s.startUs,s.endUs)).filter(s=>s.endUs>s.startUs);
}

// Share endpoint selection across desktop, external agents and export. Deleted
// endpoints use surviving membership; unrelated retained words split runs.
export function visualTimingRequest(document:{composition?:CompositionDocument;words:TimedWord[];deletedRanges?:Array<{wordIndices:number[]}>;clips?:Array<{start:number;sourceMap?:{kind:string;segments:Array<{processedStartUs:number;originalStartUs:number;originalEndUs:number}>}}>}){
  const deleted=new Set((document.deletedRanges||[]).flatMap(r=>r.wordIndices)),ids=new Set<string>();
  for(const element of Object.values(document.composition?.elements||{})){
    const p=element.placement;if(!element.enabled||p.kind!=='speech'||p.timingBasis==='transcript')continue;
    const a=document.words.findIndex(w=>w.id===p.startWordId),b=document.words.findIndex(w=>w.id===p.endWordId),membership=new Set(p.memberWordIds||document.words.slice(a,b+1).flatMap(w=>w.id?[w.id]:[]));
    let run:TimedWord[]=[];const flush=()=>{if(run.length){if(run[0].id)ids.add(run[0].id);if(run.at(-1)!.id)ids.add(run.at(-1)!.id!);run=[];}};
    document.words.forEach((w,i)=>{if(deleted.has(i))return;if(w.id&&membership.has(w.id))run.push(w);else flush();});flush();
  }
  const points=new Set<number>();for(const c of document.clips||[]){const map=c.sourceMap;if(map?.kind!=='silence-processed')continue;const sorted=[...map.segments].sort((a,b)=>a.processedStartUs-b.processedStartUs);sorted.slice(1).forEach((s,i)=>{if(s.originalStartUs>sorted[i].originalEndUs)points.add(us(c.start)+s.processedStartUs);});}
  return {visual_word_ids:[...ids].sort().slice(0,1000),visual_cut_points:[...points].sort((a,b)=>a-b)};
}
export function resolvePlacement(p:Placement,manifest:CutManifest,words:TimedWord[]){const spans=resolvePlacementSpans(p,manifest,words);return {startUs:spans[0]?.startUs||0,endUs:spans.at(-1)?.endUs||0};}
export function speechPlacementForTimeline(startUs:number,endUs:number,manifest:CutManifest,words:TimedWord[]):Placement{
  const removed=new Set(manifest.removedWordIds||[]),chosen=words.filter(w=>w.id&&!removed.has(w.id)&&manifest.segments.some(s=>{const a=Math.max(us(w.start),s.globalSourceStartUs),b=Math.min(us(w.end),s.globalSourceStartUs+s.sourceEndUs-s.sourceStartUs);return b>a&&s.editStartUs+b-s.globalSourceStartUs>startUs&&s.editStartUs+a-s.globalSourceStartUs<endUs;}));
  if(!chosen.length)return {kind:'timeline',startUs,endUs};
  const firstClip=chosen[0].clipId||'base',clipWords=chosen.filter(w=>(w.clipId||'base')===firstClip),segment=manifest.segments.find(s=>s.clipId===firstClip),clipOffset=segment?segment.globalSourceStartUs-segment.sourceStartUs:0;
  const placement:Placement={kind:'speech',startWordId:chosen[0].id!,endWordId:chosen.at(-1)!.id!,memberWordIds:chosen.map(w=>w.id!),startOffsetUs:0,endOffsetUs:0,fallbackClock:'clip-local',fallback:{clipId:firstClip,startUs:Math.min(...clipWords.map(w=>us(w.start)))-clipOffset,endUs:Math.max(...clipWords.map(w=>us(w.end)))-clipOffset}};
  const resolved=resolvePlacement(placement,manifest,words);placement.startOffsetUs=startUs-resolved.startUs;placement.endOffsetUs=endUs-resolved.endUs;return placement;
}
