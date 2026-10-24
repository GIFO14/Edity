import type { CompositionDocument, CutManifest, TimedWord, RenderPlan, FrameLayer, ResolvedElement } from './types';
import { editToSource, resolvePlacement,resolvePlacementSpans } from './timeMap';
import { animate, transitionLayers } from './presetRegistry';
import { validateComposition } from './validation';
import {IntervalIndex} from './intervalIndex';
import {speechDuckingEnvelope} from './speechDucking';
const indexes=new WeakMap<RenderPlan,IntervalIndex<ResolvedElement>>();
export function compileComposition(document: CompositionDocument, manifest: CutManifest, words: TimedWord[] = []): RenderPlan {
  validateComposition(document);
  const elements=Object.values(document.elements).map(element => {
    let elapsedUs=0;
    const activeSpans=resolvePlacementSpans(element.placement,manifest,words).map(span=>{const result={...span,elapsedUs};elapsedUs+=span.endUs-span.startUs;return result;});
    const times={startUs:activeSpans[0]?.startUs||0,endUs:activeSpans.at(-1)?.endUs||0};
    return {...element,...times,activeSpans,activeDurationUs:elapsedUs,suppressed:!activeSpans.length};
  }).sort((a,b)=>(document.tracks.find(t=>t.id===a.trackId)?.order||0)-(document.tracks.find(t=>t.id===b.trackId)?.order||0)||a.order-b.order||a.id.localeCompare(b.id));
  const transitions=Object.values(document.transitions).map(t => {
    let at=t.atUs;
    if(t.sourceAnchor){ const s=manifest.segments.find(s=>s.clipId===t.sourceAnchor!.clipId && s.sourceStartUs<=t.sourceAnchor!.sourceUs && s.sourceEndUs>=t.sourceAnchor!.sourceUs); if(!s) return {...t,startUs:0,endUs:0}; at=s.editStartUs+t.sourceAnchor.sourceUs-s.sourceStartUs; }
    const half=t.alignment==='before'?t.durationUs:t.alignment==='after'?0:Math.floor(t.durationUs/2);
    return {...t,atUs:at,startUs:Math.max(0,at-half),endUs:Math.min(manifest.durationUs,at+t.durationUs-half)};
  }).sort((a,b)=>a.atUs-b.atUs);
  for(let i=0;i<transitions.length;i++) {
    const t=transitions[i]; if(i) t.startUs=Math.max(t.startUs,Math.ceil((transitions[i-1].atUs+t.atUs)/2));
    if(i+1<transitions.length) t.endUs=Math.min(t.endUs,Math.floor((t.atUs+transitions[i+1].atUs)/2));
  }
  // One deterministic voice envelope, consumed by both adapters. No independent live detector.
  const envelope=speechDuckingEnvelope(manifest,words,document.buses.voice.mute);
  return {version:2,document,manifest,elements,transitions,audio:{sampleRate:48000,durationUs:manifest.durationUs,masterGainDb:document.masterGainDb,
    voiceGainDb:document.buses.voice.gainDb,voiceMute:document.buses.voice.mute,duckEnvelope:envelope,
    entries:elements.filter(e=>!e.suppressed && e.enabled && e.assetId && e.audio && !document.tracks.find(t=>t.id===e.trackId)?.muted).flatMap(e=>e.activeSpans!.map((span,index)=>({...e.audio!,id:e.activeSpans!.length>1?`${e.id}:${index}`:e.id,assetId:e.assetId!,startUs:span.startUs,endUs:span.endUs,sourceInUs:e.sourceInUs,sourcePhaseUs:span.elapsedUs+(e.contentWindow?.offsetUs||0),envelopePhaseUs:span.elapsedUs+(e.audio!.envelopeWindow?.offsetUs||0),activeDurationUs:e.audio!.envelopeWindow?.durationUs||e.activeDurationUs,endPolicy:e.endPolicy,
      gainDb:e.audio!.gainDb+document.buses[e.audio!.bus].gainDb,mute:e.audio!.mute||document.buses[e.audio!.bus].mute})))}};
}
function layerFor(plan:RenderPlan,e:ResolvedElement,timeUs:number):FrameLayer {
  const span=e.activeSpans?.find(s=>s.startUs<=timeUs&&timeUs<s.endUs),elapsedUs=(span?span.elapsedUs+timeUs-span.startUs:Math.max(0,timeUs-e.startUs))+(e.contentWindow?.offsetUs||0);
  let sourceTimeUs=e.sourceInUs+elapsedUs;
  if(e.kind==='base') sourceTimeUs=editToSource(plan.manifest,timeUs)?.globalSourceUs || 0;
  const sourceId=e.kind==='base'?editToSource(plan.manifest,timeUs)?.clipId:e.assetId;
  const grade=e.colorGrade??(sourceId?plan.document.sourceGrades?.[sourceId]:undefined)??(e.assetId?plan.document.sourceGrades?.[e.assetId]:undefined);
  const asset=e.assetId?plan.document.assets[e.assetId]:null;
  if(asset?.durationUs){ if(e.endPolicy==='loop')sourceTimeUs=e.sourceInUs+elapsedUs%Math.max(1,asset.durationUs-e.sourceInUs); else sourceTimeUs=Math.min(sourceTimeUs,asset.durationUs-1); }
  const layer:FrameLayer={id:e.id,element:e,sourceTimeUs,colorGrade:grade,transform:{...e.transform,crop:{...e.transform.crop}},blur:0,blurAngle:0,radialBlur:0,keyColor:'#00ff00',keyTolerance:-1,keySoftness:.01,keySpill:0,mirrorEdges:false};
  for(const p of e.presets)animate(layer,p,elapsedUs/1e6,((e.contentWindow?.durationUs??e.activeDurationUs??e.endUs-e.startUs)-elapsedUs)/1e6);
  return layer;
}
// Transition pictures use source handles. The voice keeps the original cut manifest.
function transitionLayer(plan:RenderPlan,e:ResolvedElement,timeUs:number,atUs:number,incoming:boolean):FrameLayer {
  const anchorUs=incoming?Math.max(e.startUs,atUs):Math.min(e.endUs-1,atUs-1);
  const anchor=layerFor(plan,e,anchorUs);
  // Effects keep advancing while source handles extend the neighbouring clip.
  const layer=layerFor(plan,e,timeUs);
  let sourceTimeUs=anchor.sourceTimeUs+timeUs-anchorUs;
  if(e.kind==='base') {
    const frameUs=1e6*plan.document.canvas.fps.den/plan.document.canvas.fps.num;
    // A native timeline can round a cut to the nearest canvas frame.
    const cuts=plan.manifest.segments.slice(1);
    const cut=cuts.reduce<typeof cuts[number]|undefined>((best,s)=>
      Math.abs(s.editStartUs-atUs)<=frameUs/2+1&&(!best||Math.abs(s.editStartUs-atUs)<Math.abs(best.editStartUs-atUs))?s:best,undefined);
    if(cut) {
      const index=plan.manifest.segments.indexOf(cut),previous=plan.manifest.segments[index-1];
      const sourceAnchor=incoming?cut.globalSourceStartUs:previous.globalSourceStartUs+previous.sourceEndUs-previous.sourceStartUs;
      sourceTimeUs=sourceAnchor+timeUs-atUs;
    }
  }
  const asset=e.assetId?plan.document.assets[e.assetId]:undefined;
  layer.colorGrade=anchor.colorGrade;
  layer.sourceTimeUs=Math.max(0,Math.min(sourceTimeUs,(asset?.durationUs||Number.MAX_SAFE_INTEGER)-1));
  return layer;
}
export function evaluateFrame(plan:RenderPlan,timeUs:number):FrameLayer[] {
  if(!indexes.has(plan))indexes.set(plan,new IntervalIndex(plan.elements));
  const layers=indexes.get(plan)!.at(timeUs).filter(e=>e.enabled&&!e.suppressed && e.kind!=='audio' && !plan.document.tracks.find(t=>t.id===e.trackId)?.muted&&(!e.activeSpans||e.activeSpans.some(s=>s.startUs<=timeUs&&timeUs<s.endUs)))
    .filter(e=>e.endPolicy!=='trim'||e.kind==='base'||!e.assetId||!plan.document.assets[e.assetId].durationUs||(e.contentWindow?.offsetUs||0)+(e.activeSpans?.find(s=>s.startUs<=timeUs&&timeUs<s.endUs)?.elapsedUs||0)+timeUs-(e.activeSpans?.find(s=>s.startUs<=timeUs&&timeUs<s.endUs)?.startUs??e.startUs)+e.sourceInUs<plan.document.assets[e.assetId].durationUs)
    .map(e=>layerFor(plan,e,timeUs));
  for(const t of plan.transitions){ if(timeUs<t.startUs||timeUs>=t.endUs||t.endUs<=t.startUs)continue;
    const from=plan.elements.find(e=>e.id===t.fromId),to=plan.elements.find(e=>e.id===t.toId);if(!from||!to)continue;
    if(!from.enabled||!to.enabled||from.suppressed||to.suppressed)continue;
    const inForeignGap=(e:ResolvedElement)=>!!e.activeSpans&&e.activeSpans.length>1&&timeUs>=e.startUs&&timeUs<e.endUs&&!e.activeSpans.some(s=>s.startUs<=timeUs&&timeUs<s.endUs);
    if(inForeignGap(from)||inForeignGap(to))continue;
    const a=transitionLayer(plan,from,timeUs,t.atUs,false),b=transitionLayer(plan,to,timeUs,t.atUs,true);
    a.id=`${t.id}:out`;b.id=`${t.id}:in`;
    const frameUs=1e6*plan.document.canvas.fps.den/plan.document.canvas.fps.num;
    // Fusion RenderEnd is the last inclusive frame, not the exclusive interval end.
    const duration=t.endUs-t.startUs-(t.preset.presetId.startsWith('Xir_')?frameUs:0);
    transitionLayers(a,b,t.preset,Math.max(0,Math.min(1,(timeUs-t.startUs)/Math.max(1,duration))));
    const index=layers.findIndex(l=>l.element.id===from.id||l.element.id===to.id);
    for(let i=layers.length-1;i>=0;i--)if(layers[i].element.id===from.id||layers[i].element.id===to.id)layers.splice(i,1);
    layers.splice(Math.max(0,index),0,a,b);
  }
  return layers;
}
