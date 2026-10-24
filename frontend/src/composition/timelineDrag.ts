import type {Element,CutManifest,TimedWord} from './types';
import {speechPlacementForTimeline} from './timeMap';
export type DragMode='move'|'start'|'end';
export interface DragRange {start:number;end:number;duration:number;mode:DragMode}
export function dragRange(original:DragRange,delta:number,minimum:number,points:number[],tolerance:number){
  const {start:a,end:b,duration,mode}=original,min=Math.min(minimum,b-a);
  let start=mode==='end'?a:mode==='move'?Math.max(0,Math.min(duration-(b-a),a+delta)):Math.max(0,Math.min(b-min,a+delta));
  let end=mode==='move'?start+b-a:mode==='start'?b:Math.min(duration,Math.max(a+min,b+delta));
  let snapped:number|null=null,best=tolerance+1,adjust=0;
  for(const point of points)for(const edge of mode==='move'?[start,end]:[mode==='start'?start:end]){
    const distance=Math.abs(point-edge);if(distance>tolerance||distance>=best)continue;
    const difference=point-edge,nextStart=mode==='end'?start:start+difference,nextEnd=mode==='start'?end:end+difference;
    if(nextStart<0||nextEnd>duration||nextEnd-nextStart<min)continue;
    best=distance;adjust=difference;snapped=point;
  }
  if(snapped!==null){if(mode!=='end')start+=adjust;if(mode!=='start')end+=adjust;}
  return {start:Math.round(start),end:Math.round(end),snapped};
}
export function dragElement(element:Element,originalStart:number,originalEnd:number,start:number,end:number,mode:DragMode,manifest:CutManifest,words:TimedWord[]):Element{
  let placement={...element.placement};
  if(placement.kind==='speech'){
    // A manual drag is an exact edit-time decision. Pin its offsets to stable
    // transcript bounds, so a later acoustic endpoint lookup cannot move it.
    placement=speechPlacementForTimeline(start,end,{...manifest,wordTimings:undefined},words);
    if(placement.kind==='speech')placement.timingBasis='transcript';
  }else if(placement.kind==='timeline'){
    if(placement.ranges){
      const delta=start-originalStart;
      const ranges=mode==='move'?placement.ranges.map(s=>({startUs:s.startUs+delta,endUs:s.endUs+delta})):placement.ranges.map((s,i,all)=>({startUs:Math.max(start,i===0&&start<originalStart?start:s.startUs),endUs:Math.min(end,i===all.length-1&&end>originalEnd?end:s.endUs)})).filter(s=>s.endUs>s.startUs);
      placement.ranges=ranges;placement.startUs=ranges[0]?.startUs??start;placement.endUs=ranges.at(-1)?.endUs??end;
    }else{placement.startUs=start;placement.endUs=end;}
  }
  else{
    // Project/source anchors retain their kind and existing offset semantics.
    placement.startOffsetUs=(placement.startOffsetUs||0)+(start-originalStart);
    placement.endOffsetUs=(placement.endOffsetUs||0)+(end-originalEnd);
  }
  const trim=mode!=='start'?0:start<originalStart?start-originalStart:element.placement.kind==='timeline'&&element.placement.ranges?element.placement.ranges.reduce((sum,s)=>sum+Math.max(0,Math.min(start,s.endUs)-s.startUs),0):start-originalStart;
  return {...element,placement,...(element.contentWindow&&trim?{contentWindow:{...element.contentWindow,offsetUs:Math.max(0,element.contentWindow.offsetUs+trim)}}:{}),...(element.audio?.envelopeWindow&&trim?{audio:{...element.audio,envelopeWindow:{...element.audio.envelopeWindow,offsetUs:Math.max(0,element.audio.envelopeWindow.offsetUs+trim)}}}:{}),sourceInUs:!element.contentWindow&&mode==='start'&&(element.kind==='video'||element.kind==='audio')?Math.max(0,element.sourceInUs+trim):element.sourceInUs};
}
