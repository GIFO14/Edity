import extensions from '../../../shared/media-files.json';
import {defaultTransform} from './types';
import type {Asset,Element,CompositionDocument} from './types';

export function droppedMediaKind(file:string):'image'|'video'|'audio'|null {
  const ext=file.slice(file.lastIndexOf('.')).toLowerCase();
  for(const kind of ['image','video','audio'] as const)if(extensions[kind].includes(ext))return kind;
  return null;
}
export function dropTime(clientX:number,left:number,scrollLeft:number,width:number,duration:number){
  return Math.max(0,Math.min(duration-1,Math.round((clientX-left+scrollLeft)/Math.max(1,width)*duration)));
}
export function droppedElement(asset:Asset,startUs:number,durationUs:number,document:CompositionDocument,trackId?:string):Element {
  if(!['image','video','audio'].includes(asset.kind)||asset.status!=='ready')throw new Error(`Resource is not ready: ${asset.name}`);
  const kind=asset.kind as 'image'|'video'|'audio';
  const track=kind==='audio'?(trackId==='sound'?'sound':'music'):'visual';
  if(!document.tracks.some(t=>t.id===track))throw new Error(`Missing ${track} track`);
  const start=Math.max(0,Math.min(durationUs-1,Math.round(startUs)));
  const length=kind==='image'?5e6:asset.durationUs;
  if(length<=0||durationUs<=0)throw new Error(`Resource has no playable duration: ${asset.name}`);
  const end=Math.min(durationUs,start+length),audio=kind==='audio';
  return {id:crypto.randomUUID(),kind,assetId:asset.id,trackId:track,
    order:Math.max(0,...Object.values(document.elements).map(e=>e.order))+1,label:asset.name,
    enabled:true,createdBy:'manual',placement:{kind:'timeline',startUs:start,endUs:end},
    transform:defaultTransform(),presets:[],sourceInUs:0,endPolicy:kind==='image'?'hold':'trim',
    ...(kind==='image'?{}:{audio:{gainDb:audio&&track==='music'?-10.46:0,mute:!audio,
      fadeInUs:Math.min(150000,Math.floor((end-start)/2)),fadeOutUs:Math.min(250000,Math.floor((end-start)/2)),
      ducking:false,bus:audio?track as 'music'|'sound':'supplemental'}})};
}
