// Narration is a permutation/parking of immutable clip-local source partitions.
// Original transcript arrays and word IDs never become output-time coordinates.
import type {TimedWord,NarrationArrangement,NarrationFragment} from './types';
type Clip={id:string;start:number;duration:number};
type Document={words:TimedWord[];clips:Clip[];narration?:NarrationArrangement;composition?:any};
const us=(n:number)=>Math.round(n*1e6);
function clipsFor(d:Document){const total=d.composition?.assets[d.composition?.elements.base?.assetId]?.durationUs||Math.max(0,...d.clips.map(c=>us(c.start+c.duration)));return d.clips.map(c=>({...c,durationUs:Math.max(0,Math.min(us(c.duration)||total,total-us(c.start)))}));}
function fragment(d:Document,clipId:string,a:number,b:number):NarrationFragment{
  const clip=d.clips.find(c=>c.id===clipId)!;
  const members=d.words.filter(w=>w.clipId===clipId&&us((w.start+w.end)/2-clip.start)>=a&&us((w.start+w.end)/2-clip.start)<b).flatMap(w=>w.id?[w.id]:[]);
  return {id:`n-${clipId}-${a}-${b}`,clipId,startUs:a,endUs:b,memberWordIds:members};
}
export function naturalNarration(d:Document):NarrationArrangement{return {version:1,order:clipsFor(d).filter(c=>c.durationUs>0).map(c=>fragment(d,c.id,0,c.durationUs)),parked:[],cutClipboard:[]};}
export function validateNarration(d:Document,n:NarrationArrangement){
  if(n.version!==1||!Array.isArray(n.order)||!Array.isArray(n.parked)||!Array.isArray(n.cutClipboard))throw new Error('Invalid narration arrangement');
  const ids=new Set<string>(),clips=clipsFor(d),known=new Map(clips.map(c=>[c.id,c]));
  for(const f of [...n.order,...n.parked]){
    if(!f.id||ids.has(f.id)||!known.has(f.clipId)||!Number.isSafeInteger(f.startUs)||!Number.isSafeInteger(f.endUs)||f.startUs<0||f.endUs<=f.startUs||!Array.isArray(f.memberWordIds))throw new Error('Invalid or repeated narration fragment');ids.add(f.id);
    if(f.endUs>known.get(f.clipId)!.durationUs)throw new Error('Narration fragment exceeds its prepared source');
    const expected=fragment(d,f.clipId,f.startUs,f.endUs).memberWordIds;if(JSON.stringify(f.memberWordIds)!==JSON.stringify(expected))throw new Error('Narration membership does not match its immutable source partition');
  }
  for(const clip of clips){let cursor=0;for(const f of [...n.order,...n.parked].filter(f=>f.clipId===clip.id).sort((a,b)=>a.startUs-b.startUs)){if(f.startUs!==cursor)throw new Error('Narration source coverage has a gap or duplicate voice');cursor=f.endUs;}if(cursor!==clip.durationUs)throw new Error('Narration must account for every source exactly once');}
  if(new Set(n.cutClipboard).size!==n.cutClipboard.length||n.cutClipboard.some(id=>!n.parked.some(f=>f.id===id)))throw new Error('Invalid cut clipboard');
  return n;
}
export function reconcileNarration(d:Document,n:NarrationArrangement):NarrationArrangement{
  const known=new Set(d.clips.map(c=>c.id)),next=structuredClone(n);next.order=next.order.filter(f=>known.has(f.clipId));next.parked=next.parked.filter(f=>known.has(f.clipId));next.cutClipboard=next.cutClipboard.filter(id=>next.parked.some(f=>f.id===id));
  for(const c of clipsFor(d))if(![...next.order,...next.parked].some(f=>f.clipId===c.id)&&c.durationUs>0)next.order.push(fragment(d,c.id,0,c.durationUs));
  return validateNarration(d,next);
}
export function orderedWordIndices(d:Document,n=d.narration){
  if(!n)return d.words.map((_,i)=>i);const byId=new Map(d.words.map((w,i)=>[w.id,i]));return n.order.flatMap(f=>f.memberWordIds.flatMap(id=>byId.has(id)?[byId.get(id)!]:[]));
}
function cell(d:Document,id:string){
  const w=d.words.find(w=>w.id===id);if(!w||!w.clipId)throw new Error('Choose a current word ID');const c=clipsFor(d).find(c=>c.id===w.clipId);if(!c)throw new Error('Word source clip is missing');
  const words=d.words.filter(w=>w.clipId===c.id),i=words.findIndex(v=>v.id===id),mid=us((w.start+w.end)/2-c.start);
  const boundary=(left:TimedWord,right:TimedWord)=>Math.max(us((left.start+left.end)/2-c.start),Math.min(us((right.start+right.end)/2-c.start),us((left.end+right.start)/2-c.start)));
  return {clipId:c.id,startUs:i?boundary(words[i-1],w):0,endUs:i+1<words.length?boundary(w,words[i+1]):c.durationUs,midUs:mid};
}
function split(d:Document,list:NarrationFragment[],clipId:string,point:number){return list.flatMap(f=>f.clipId===clipId&&f.startUs<point&&point<f.endUs?[fragment(d,clipId,f.startUs,point),fragment(d,clipId,point,f.endUs)]:[f]);}
export function splitNarrationAtSource(d:Document,clipId:string,point:number):NarrationArrangement|null{
  const n=structuredClone(d.narration||naturalNarration(d));
  if(!n.order.some(f=>f.clipId===clipId&&f.startUs<point&&point<f.endUs))return null;
  n.order=split(d,n.order,clipId,point);return validateNarration(d,n);
}
function extract(d:Document,n:NarrationArrangement,wordIds:string[]){
  if(!wordIds.length||new Set(wordIds).size!==wordIds.length)throw new Error('Select unique narration word IDs');
  const display=orderedWordIndices(d,n).map(i=>d.words[i].id!),positions=wordIds.map(id=>display.indexOf(id)).sort((a,b)=>a-b);
  if(positions.some(i=>i<0)||positions.some((i,k)=>k>0&&i!==positions[k-1]+1))throw new Error('Select one contiguous passage in the displayed narration order');
  const selected=new Set(wordIds),cells=wordIds.map(id=>cell(d,id));
  for(const c of cells){n.order=split(d,n.order,c.clipId,c.startUs);n.order=split(d,n.order,c.clipId,c.endUs);}
  const pieces=n.order.filter(f=>f.memberWordIds.length&&f.memberWordIds.every(id=>selected.has(id)));n.order=n.order.filter(f=>!pieces.includes(f));
  if(!pieces.length)throw new Error('No narration source in this selection');const merged:NarrationFragment[]=[];for(const f of pieces){const last=merged.at(-1);if(last&&last.clipId===f.clipId&&last.endUs===f.startUs)merged[merged.length-1]=fragment(d,f.clipId,last.startUs,f.endUs);else merged.push(f);}return merged;
}
function insert(d:Document,n:NarrationArrangement,pieces:NarrationFragment[],beforeWordId?:string|null,position='end'){
  let index=n.order.length;
  if(beforeWordId){if(pieces.some(f=>f.memberWordIds.includes(beforeWordId)))throw new Error('Destination is inside the moved passage');const c=cell(d,beforeWordId);n.order=split(d,n.order,c.clipId,c.startUs);index=n.order.findIndex(f=>f.memberWordIds.includes(beforeWordId));if(index<0)throw new Error('Destination word is parked or missing');}
  else if(position==='start')index=0;else if(position!=='end')throw new Error('Choose start, end or beforeWordId');
  n.order.splice(index,0,...pieces);return validateNarration(d,n);
}
export function moveNarration(d:Document,wordIds:string[],beforeWordId?:string|null,position='end'){const n=structuredClone(d.narration||naturalNarration(d)),pieces=extract(d,n,wordIds);return insert(d,n,pieces,beforeWordId,position);}
export function cutNarration(d:Document,wordIds:string[]){const n=structuredClone(d.narration||naturalNarration(d));if(n.cutClipboard.length)throw new Error('Paste or undo the previous cut before cutting another passage');const pieces=extract(d,n,wordIds);n.parked.push(...pieces);n.cutClipboard=pieces.map(f=>f.id);return validateNarration(d,n);}
export function pasteNarration(d:Document,beforeWordId?:string|null,position='end'){const n=structuredClone(d.narration||naturalNarration(d));if(!n.cutClipboard.length)throw new Error('There is no cut narration to paste');const selected=new Set(n.cutClipboard),pieces=n.cutClipboard.map(id=>n.parked.find(f=>f.id===id)!);n.parked=n.parked.filter(f=>!selected.has(f.id));n.cutClipboard=[];return insert(d,n,pieces,beforeWordId,position);}
export function orderedKeepSegments(n:NarrationArrangement|undefined,clips:Clip[],keep:Array<{start:number;end:number}>){
  if(!n)return keep;const map=new Map(clips.map(c=>[c.id,c]));const output:Array<{start:number;end:number}>=[];
  for(const f of n.order){const c=map.get(f.clipId);if(!c)throw new Error('Narration source clip missing');const a=c.start+f.startUs/1e6,b=c.start+f.endUs/1e6;for(const k of keep){const start=Math.max(a,k.start),end=Math.min(b,k.end);if(end<=start)continue;const last=output.at(-1);if(last&&Math.abs(last.end-start)<.0000005)last.end=end;else output.push({start,end});}}
  return output;
}
export function narrationManifestClips<T extends Clip>(clips:T[],n?:NarrationArrangement):T[]{if(!n)return clips;return clips.map(c=>({...c,duration:Math.max(0,...[...n.order,...n.parked].filter(f=>f.clipId===c.id).map(f=>f.endUs))/1e6}));}
