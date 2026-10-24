import type {CompositionDocument,Element,Operation,ResolvedElement} from './types';

export const gainLabel=(db:number)=>`${db>0?'+':''}${db.toFixed(1)} dB`;
export function dragGain(original:number,deltaY:number,fine=false){
  return Math.round(Math.max(-96,Math.min(24,original-deltaY*(fine?.1:.5)))*10)/10;
}
export function gainLineTop(gain:number,height:number){return Math.max(23,Math.min(height-7,30-gain*2));}

// Splits are windows onto the same content clock. They must not restart loops,
// fades or preset animations, including a split inside an existing fade.
export function splitElement(document:CompositionDocument,element:ResolvedElement,atUs:number,newId:string):Operation[]{
  const original=document.elements[element.id];
  if(!original||element.kind==='base')throw new Error('Choose a media clip to split');
  const spans=element.activeSpans||[{startUs:element.startUs,endUs:element.endUs,elapsedUs:0}];
  const span=spans.find(s=>atUs>=s.startUs&&atUs<s.endUs);
  if(!span||atUs<=element.startUs||atUs>=element.endUs)throw new Error('Cut inside the clip');
  const elapsed=span.elapsedUs+atUs-span.startUs,total=element.activeDurationUs||element.endUs-element.startUs;
  if(elapsed<=0||elapsed>=total)throw new Error('Cut inside the clip');
  const offset=original.contentWindow?.offsetUs||0,contentDuration=original.contentWindow?.durationUs||total;
  const audioOffset=original.audio?.envelopeWindow?.offsetUs||0,audioDuration=original.audio?.envelopeWindow?.durationUs||total;
  const part=(right:boolean):Element=>{
    const ranges=spans.map(s=>({startUs:Math.max(s.startUs,right?atUs:element.startUs),endUs:Math.min(s.endUs,right?element.endUs:atUs)})).filter(s=>s.endUs>s.startUs);
    return {...structuredClone(original),id:right?newId:original.id,
    placement:{kind:'timeline',startUs:ranges[0].startUs,endUs:ranges.at(-1)!.endUs,ranges:ranges.length>1?ranges:null},
    contentWindow:{offsetUs:offset+(right?elapsed:0),durationUs:contentDuration},
    ...(original.audio?{audio:{...original.audio,envelopeWindow:{offsetUs:audioOffset+(right?elapsed:0),durationUs:audioDuration}}}:{}),
  };};
  const left=part(false),right=part(true),operations:Operation[]=[{type:'update',id:original.id,changes:left},{type:'add',element:right}];
  for(const t of Object.values(document.transitions)){
    const fromId=t.fromId===original.id&&t.atUs>=atUs?newId:t.fromId;
    const toId=t.toId===original.id&&t.atUs>=atUs?newId:t.toId;
    if(fromId!==t.fromId||toId!==t.toId)operations.push({type:'transition',transition:{...t,fromId,toId}});
  }
  return operations;
}
