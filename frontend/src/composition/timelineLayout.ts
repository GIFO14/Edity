import type {ActiveSpan,ResolvedElement} from './types';
export function timelineLanes(elements:ResolvedElement[]){
  const lanes:Array<Array<{startUs:number;endUs:number}>>=[],byId:Record<string,number>={};
  for(const element of [...elements].sort((a,b)=>a.startUs-b.startUs||a.order-b.order||a.id.localeCompare(b.id))){
    const spans=element.activeSpans||[element];let lane=lanes.findIndex(items=>!spans.some(s=>items.some(i=>s.startUs<i.endUs&&s.endUs>i.startUs)));
    if(lane<0){lane=lanes.length;lanes.push([]);}lanes[lane].push(...spans);byId[element.id]=lane;
  }
  return {byId,count:Math.max(1,lanes.length)};
}
export function fadeDuration(original:number,deltaUs:number,mode:'fadeIn'|'fadeOut',length:number){
  return Math.round(Math.max(0,Math.min(length,original+(mode==='fadeIn'?deltaUs:-deltaUs))));
}
export function timeAtElapsed(spans:ActiveSpan[],elapsed:number){
  for(const s of spans){const length=s.endUs-s.startUs;if(elapsed<s.elapsedUs+length)return s.startUs+Math.max(0,elapsed-s.elapsedUs);}
  return spans.at(-1)?.endUs||0;
}
export function fadeGain(elapsed:number,length:number,fadeIn:number,fadeOut:number){
  return Math.max(0,Math.min(1,fadeIn?elapsed/fadeIn:1))*Math.max(0,Math.min(1,fadeOut?(length-elapsed)/fadeOut:1));
}
// Preserve the real fade endpoints even on a long clip with a very short fade.
// Uniform samples across the whole clip can draw the ramp far past its handle.
export function fadeEnvelopePoints(phase:number,spanLength:number,total:number,fadeIn:number,fadeOut:number){
  const end=phase+spanLength,points=new Set([phase,end]);
  for(const p of [fadeIn,total-fadeOut])if(p>phase&&p<end)points.add(p);
  const overlapStart=Math.max(phase,total-fadeOut),overlapEnd=Math.min(end,fadeIn);
  if(fadeIn>0&&fadeOut>0&&overlapEnd>overlapStart)for(let i=1;i<24;i++)points.add(overlapStart+(overlapEnd-overlapStart)*i/24);
  return [...points].sort((a,b)=>a-b).map(t=>({x:(t-phase)/Math.max(1,spanLength)*100,y:1+(1-fadeGain(t,total,fadeIn,fadeOut))*96}));
}
