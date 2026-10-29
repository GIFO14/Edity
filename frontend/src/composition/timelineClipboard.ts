import {defaultTransform,defaultTextStyle} from './types';
import type {Asset,CompositionDocument,Element} from './types';

export interface CopiedTimelineElement {version:1;sourceProjectId:string;element:Element;assets:Record<string,Asset>}
export type TimelineClipboard={kind:'element';payload:CopiedTimelineElement}|{kind:'files';files:Array<{path:string;name:string}>}|{kind:'text';text:string}|{kind:'empty'};

export function pastedElement(payload:CopiedTimelineElement,document:CompositionDocument,startUs:number,durationUs:number,assetIds:Record<string,string>,trackId?:string):Element {
  const original=payload.element;
  if(original.kind==='base'||original.placement.kind!=='timeline')throw new Error('Choose an additional timeline element');
  const start=Math.max(0,Math.round(startUs));
  if(start>=durationUs)throw new Error('Move the playhead before the end of the video');
  const ranges=(original.placement.ranges||[{startUs:0,endUs:original.placement.endUs}])
    .map(s=>({startUs:start+s.startUs,endUs:Math.min(durationUs,start+s.endUs)})).filter(s=>s.endUs>s.startUs);
  if(!ranges.length)throw new Error('No space for this element at the paste position');
  const element:Element={...structuredClone(original),id:crypto.randomUUID(),createdBy:'manual',
    order:Math.max(0,...Object.values(document.elements).map(e=>e.order))+1,
    placement:{kind:'timeline',startUs:ranges[0].startUs,endUs:ranges.at(-1)!.endUs,...(ranges.length>1?{ranges}:{})}};
  if(element.kind==='audio'&&['music','sound'].includes(trackId||'')){
    element.trackId=trackId!;if(element.audio)element.audio.bus=trackId as 'music'|'sound';
  }
  if(element.assetId)element.assetId=assetIds[element.assetId]||element.assetId;
  if(element.textStyle?.fontAssetId)element.textStyle.fontAssetId=assetIds[element.textStyle.fontAssetId]||element.textStyle.fontAssetId;
  return element;
}

export function pastedText(text:string,document:CompositionDocument,startUs:number,durationUs:number):Element {
  if(!text.trim())throw new Error('The clipboard is empty');
  if(text.length>20000)throw new Error('The copied text is too long for a timeline label');
  const start=Math.max(0,Math.round(startUs)),end=Math.min(durationUs,start+5e6);
  if(end<=start)throw new Error('Move the playhead before the end of the video');
  return {id:crypto.randomUUID(),kind:'text',trackId:'text',order:Math.max(0,...Object.values(document.elements).map(e=>e.order))+1,
    label:text.slice(0,80),text,textStyle:defaultTextStyle(),enabled:true,createdBy:'manual',
    placement:{kind:'timeline',startUs:start,endUs:end},transform:defaultTransform(),presets:[],sourceInUs:0,endPolicy:'hold'};
}
