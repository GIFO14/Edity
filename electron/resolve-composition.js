const path=require('node:path');
const runtime=require('../shared/composition-runtime.cjs');
const esc=v=>String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const num=v=>String(Math.round(v*1e6)/1e6);
function resolvePlan(document,manifest){return document.composition?.version===2?runtime.compileComposition(document.composition,manifest,document.words||[]):null;}
function visibleElements(plan){return plan?plan.elements.filter(e=>e.enabled&&!e.suppressed&&!plan.document.tracks.find(t=>t.id===e.trackId)?.muted):[];}
function extraSources(plan,directory,patches=[]){const primary=plan?.elements.find(e=>e.kind==='base');return [...new Set([
 ...visibleElements(plan).filter(e=>e.id!==primary?.id&&e.assetId).map(e=>path.resolve(directory,plan.document.assets[e.assetId].normalizedPath||plan.document.assets[e.assetId].path)),
 ...patches.map(p=>p.path)
])];}
function fidelityWindows(plan){
 if(!plan)return [];
 const windows=plan.transitions.filter(t=>t.endUs>t.startUs).map(t=>({startUs:t.startUs,endUs:t.endUs,reasons:[`Transition: ${t.preset.presetId}`]}));
 for(const e of visibleElements(plan)){
  const grade=e.colorGrade||plan.document.sourceGrades?.[e.assetId];
  const background=e.kind==='text'&&e.textStyle?.backgroundColor&&e.textStyle.backgroundColor!=='#00000000'&&!/^#[0-9a-f]{6}00$/i.test(e.textStyle.backgroundColor);
  const unsupported=e.kind==='text'||e.presets.length>0||Math.abs(e.transform.pitch)+Math.abs(e.transform.yaw)>0||runtime.isColorGraded(grade)||e.matteColor||background;
  const baseGrades=e.kind==='base'&&Object.values(plan.document.sourceGrades||{}).some(runtime.isColorGraded);
  if(unsupported||baseGrades)for(const s of e.activeSpans)windows.push({startUs:s.startUs,endUs:s.endUs,reasons:[`Edity effect: ${e.label}`]});
 }
 // Shared compositor plates include the full picture, with no audio. Native
 // editable clips stay underneath; overlapping effects must not duplicate plates.
 const merged=[];
 const frame=1e6*plan.document.canvas.fps.den/plan.document.canvas.fps.num;
 for(const w of windows.map(w=>({...w,startUs:Math.max(0,Math.round(Math.floor(w.startUs/frame+1e-7)*frame)),endUs:Math.min(plan.manifest.durationUs,Math.round(Math.ceil(w.endUs/frame-1e-7)*frame))})).sort((a,b)=>a.startUs-b.startUs)){
  const last=merged.at(-1);if(last&&w.startUs<=last.endUs){last.endUs=Math.max(last.endUs,w.endUs);last.reasons=[...new Set([...last.reasons,...w.reasons])];}else merged.push({...w});
 }
 return merged;
}
function compact(points){const out=[];for(const p of points){if(out.length>1&&out.at(-1).value===p.value&&out.at(-2).value===p.value)out[out.length-1]=p;else out.push(p);}return out;}
function sampleTimes(span,fps,dynamic){
 if(!dynamic)return [span.startUs];const step=1e6*fps.den/fps.num,times=[];
 for(let index=0;span.startUs+index*step<span.endUs;index++)times.push(Math.round(span.startUs+index*step));
 times.push(span.endUs);return times;
}
function animation(name,points,time){
 if(points.every(p=>p.value===points[0].value))return '';
 return `<param name="${name}"><keyframeAnimation>${compact(points).map(p=>`<keyframe time="${time(p.timeUs)}" value="${esc(p.value)}" interp="linear" curve="linear"/>`).join('')}</keyframeAnimation></param>`;
}
function geometry(t,asset,canvas){
 const W=canvas.width,H=canvas.height,aspect=(asset?.width||W)/(asset?.height||H),text=asset===null;let bw=t.width*W,bh=t.height*H;
 if(!text&&t.fit==='contain'){const fit=Math.min(bw/aspect,bh);bw=fit*aspect;bh=fit;}
 const fullH=Math.min(W/aspect,H),fullW=fullH*aspect,rad=t.rotation*Math.PI/180;
 const dx=(.5-t.pivotX)*bw*t.scaleX,dy=(.5-t.pivotY)*bh*t.scaleY;
 return {position:`${num(((t.x-.5)*W+Math.cos(rad)*dx-Math.sin(rad)*dy)/H*100)} ${num(-((t.y-.5)*H+Math.sin(rad)*dx+Math.cos(rad)*dy)/H*100)}`,
  scale:`${num((text?1:bw/fullW)*t.scaleX)} ${num((text?1:bh/fullH)*t.scaleY)}`,rotation:num(-t.rotation),opacity:num(t.opacity)};
}
function visualXml(e,span,sourceStartUs,asset,plan,fps,time){
 // Resolve imports some FCPXML transform curves as their initial value. Keep
 // the native editable layer at its original pose; an exact appearance plate
 // above it preserves Edity's text rendering and animation for the interval.
 const first=geometry(e.transform,e.kind==='text'?null:asset,plan.document.canvas);
 const crop=e.transform.crop,ratio=(asset?.width||plan.document.canvas.width)/(asset?.height||plan.document.canvas.height);
 const cropped=Object.values(crop).some(Boolean)?`<adjust-crop mode="trim"><trim-rect left="${num(crop.left*ratio*100)}" right="${num(crop.right*ratio*100)}" top="${num(crop.top*100)}" bottom="${num(crop.bottom*100)}"/></adjust-crop>`:'';
 return cropped+`<adjust-conform type="fit"/><adjust-transform position="${first.position}" scale="${first.scale}" rotation="${first.rotation}"/><adjust-blend amount="${first.opacity}"/>`;
}
function gainAt(entry,at,plan){
 if(entry.mute)return -96;
 const phase=(entry.envelopePhaseUs??entry.sourcePhaseUs??0)+at-entry.startUs,duration=entry.activeDurationUs??entry.endUs-entry.startUs;
 let value=1;if(entry.fadeInUs)value*=Math.max(0,Math.min(1,phase/entry.fadeInUs));if(entry.fadeOutUs)value*=Math.max(0,Math.min(1,(duration-phase)/entry.fadeOutUs));
 if(entry.ducking){const points=plan.audio.duckEnvelope;let right=points.findIndex(p=>p.timeUs>=at);if(right<0)right=points.length-1;const a=points[Math.max(0,right-1)],b=points[right];if(a&&b)value*=a.gain+(b.gain-a.gain)*Math.max(0,Math.min(1,(at-a.timeUs)/Math.max(1,b.timeUs-a.timeUs)));}
 return Math.max(-96,entry.gainDb+plan.audio.masterGainDb+20*Math.log10(Math.max(1e-6,value)));
}
function volumeXml(entry,span,sourceStartUs,plan,fps,time){
 const points=[];
 const dynamic=entry.fadeInUs||entry.fadeOutUs||entry.ducking;
 for(const at of sampleTimes(span,fps,dynamic))points.push({timeUs:Math.max(0,Math.round(sourceStartUs+at-span.startUs)),value:`${num(gainAt(entry,at,plan))}dB`});
 if(!points.length)return '';return `<adjust-volume amount="${points[0].value}">${animation('amount',points,time)}</adjust-volume>`;
}
const color=value=>{let hex=String(value||'#ffffff').slice(1);if(hex.length===3)hex=hex.split('').map(v=>v+v).join('');return [0,2,4,6].map((n,i)=>num(i===3&&hex.length<8?1:parseInt(hex.slice(n,n+2),16)/255)).join(' ');};
function textXml(e,styleId){const s=e.textStyle||runtime.defaultTextStyle();return `<text><text-style ref="${styleId}">${esc(e.text||'')}</text-style></text><text-style-def id="${styleId}"><text-style font="${esc(s.fontFamily)}" fontSize="${s.fontSize}" fontFace="${s.fontWeight>=600?'Bold':'Regular'}" bold="${s.fontWeight>=600?1:0}" fontColor="${color(s.color)}" alignment="${s.align}" strokeColor="${color(s.strokeColor)}" strokeWidth="${s.strokeWidth}" shadowColor="${color(s.shadowColor)}" shadowOffset="${s.shadowX} ${-s.shadowY}" shadowBlurRadius="${s.shadowBlur}"/></text-style-def>`;}
function connectedLayers({plan,assets,directory,patches,fps,time,frameTime,framesAt}){
 if(!plan)return {resources:[],layers:[],counts:{}};
 const layers=[],resources=[],counts={audio:0,video:0,image:0,text:0,renderedEffects:patches.length};let lane=1,style=0;
 const add=(startUs,endUs,build)=>{const a=framesAt(startUs,fps),b=framesAt(endUs,fps);if(b>a)layers.push({startFrame:a,endFrame:b,build});};
 const assetFor=e=>assets.get(path.resolve(directory,plan.document.assets[e.assetId].normalizedPath||plan.document.assets[e.assetId].path));
 const primary=plan.elements.find(e=>e.kind==='base');
 for(const e of visibleElements(plan).filter(e=>e.id!==primary?.id&&e.kind!=='audio')){
  const trackLane=lane++;
  const spans=e.kind==='base'?e.activeSpans.flatMap(span=>plan.manifest.segments.flatMap(segment=>{const a=Math.max(span.startUs,segment.editStartUs),b=Math.min(span.endUs,segment.editEndUs);return b>a?[{startUs:a,endUs:b,elapsedUs:span.elapsedUs+a-span.startUs,baseSourceUs:segment.globalSourceStartUs+a-segment.editStartUs}]:[];})):e.activeSpans;
  for(const span of spans){
   const asset=e.assetId?assetFor(e):null;let cursor=span.startUs,phase=span.elapsedUs+(e.contentWindow?.offsetUs||0);
   while(cursor<span.endUs){
    let source=e.kind==='base'?span.baseSourceUs+cursor-span.startUs:e.sourceInUs+phase,length=span.endUs-cursor,freeze=false;
    if(asset&&e.kind==='video'){
     const remaining=Math.max(1,asset.durationUs-e.sourceInUs);
     if(e.endPolicy==='loop')source=e.sourceInUs+phase%remaining;
     else if(source>=asset.durationUs){if(e.endPolicy==='trim')break;source=Math.max(0,asset.durationUs-1e6*fps.den/fps.num);freeze=true;}
     if(!freeze)length=Math.min(length,Math.max(1,asset.durationUs-source));
    }
    const a=cursor,b=Math.min(span.endUs,Math.round(cursor+length));if(b<=a)break;
    const start=e.kind==='image'?0:e.kind==='text'?Math.round(phase):Math.round(source),s={startUs:a,endUs:b};
    const startTime=e.kind==='text'?time(start):frameTime(asset.startFrame+framesAt(start,asset.fps,'floor'),asset.fps);
    const intrinsic=visualXml(e,s,Math.round(e.kind==='text'?start:(asset.startFrame*1e6*asset.fps.den/asset.fps.num+start)),e.assetId?plan.document.assets[e.assetId]:null,plan,fps,time);
    const styleId=`edity-text-style-${++style}`;
    add(a,b,(offset,duration)=>e.kind==='text'?`<title ref="edity-basic-title" name="${esc(e.label)}" lane="${trackLane}" offset="${offset}" start="${startTime}" duration="${duration}">${textXml(e,styleId)}<note>${esc(`Edity text: ${e.id}`)}</note>${intrinsic}</title>`:
     `<video ref="${asset.id}" name="${esc(e.label)}" lane="${trackLane}" offset="${offset}" start="${startTime}" duration="${duration}"><note>${esc(`Edity ${e.kind}: ${e.id}`)}</note>${freeze?`<timeMap><timept time="0s" value="${startTime}" interp="linear"/><timept time="${duration}" value="${startTime}" interp="linear"/></timeMap>`:''}${intrinsic}</video>`);
    counts[e.kind==='base'?'video':e.kind]++;cursor=b;phase+=b-a;
   }
  }
 }
 if(counts.text)resources.push('<effect id="edity-basic-title" name="Basic Title" uid=".../Titles.localized/Build In:Out.localized/Basic Title.localized/Basic Title.moti"/>');
 let audioLane=-1;
 for(const entry of plan.audio.entries){
  const resource=plan.document.assets[entry.assetId];if(!resource.hasAudio)continue;const asset=assets.get(path.resolve(directory,resource.normalizedPath||resource.path));if(!asset)continue;
  const laneId=audioLane--;let cursor=entry.startUs,phase=entry.sourcePhaseUs||0;
  while(cursor<entry.endUs){
   const available=Math.max(1,asset.durationUs-entry.sourceInUs);let source=entry.sourceInUs+(entry.endPolicy==='loop'?phase%available:phase);if(source>=asset.durationUs)break;
   const end=Math.min(entry.endUs,cursor+asset.durationUs-source),startTimeUs=Math.round(asset.startFrame*1e6*asset.fps.den/asset.fps.num+source),span={startUs:cursor,endUs:end};
   const volume=volumeXml(entry,span,startTimeUs,plan,fps,time),startTime=time(startTimeUs);
   add(cursor,end,(offset,duration)=>`<audio ref="${asset.id}" name="${esc(resource.name)}" lane="${laneId}" offset="${offset}" start="${startTime}" duration="${duration}" role="${esc(entry.bus)}"><note>${esc(`Edity audio: ${entry.id}`)}</note>${volume}</audio>`);
   counts.audio++;phase+=end-cursor;cursor=end;
  }
 }
 // Exact custom transitions/effects sit above the independently editable layers.
 for(const patch of patches){const asset=assets.get(patch.path);add(patch.startUs,patch.endUs,(offset,duration)=>`<video ref="${asset.id}" name="${esc(patch.label)}" lane="${lane+1}" offset="${offset}" start="0s" duration="${duration}"><note>Rendered Edity effect; the editable clips remain underneath. ${esc(patch.reasons.join('; '))}</note></video>`);}
 return {resources,layers,counts};
}
module.exports={resolvePlan,extraSources,fidelityWindows,connectedLayers,visualXml,volumeXml};
