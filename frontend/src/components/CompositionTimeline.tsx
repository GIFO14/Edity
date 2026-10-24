import {memo,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';import type {RefObject} from 'react';
import {useCompositionStore} from '../store/compositionStore';import {useEditorStore} from '../store/editorStore';
import {compileComposition} from '../composition/compiler';import {editToSource,sourceToEdit} from '../composition/timeMap';
import {dragRange,dragElement} from '../composition/timelineDrag';import type {DragMode} from '../composition/timelineDrag';
import type {Element,Asset} from '../composition/types';import {seekSourceTime} from '../lib/playbackTime';import {commitComposition} from '../lib/projectPersistence';
import {editBoundaries,baseTimelineSegments} from '../../../shared/edit-boundaries.mjs';
import {dropTime} from '../composition/droppedMedia';
import {dropTimelineMedia} from '../lib/dropTimelineMedia';
import TimelineWaveform from './TimelineWaveform';
import TimelinePlayhead from './TimelinePlayhead';
import TimelineOverview from './TimelineOverview';
import {timelineLanes,fadeDuration,timeAtElapsed,fadeEnvelopePoints} from '../composition/timelineLayout';
import {dragGain,gainLabel,gainLineTop,splitElement} from '../composition/timelineEditing';
import {splitNarrationAtSource} from '../composition/narration';
import {Maximize2,Minimize2} from 'lucide-react';
const MAX_TIMELINE_ZOOM=1000;
type TimelineDragMode=DragMode|'fadeIn'|'fadeOut'|'gain';
type ClipDrag={element:Element;start:number;end:number;mode:TimelineDragMode;duration:number;width:number;originX:number;x:number;originY:number;y:number;originalGain:number;lastGain:number;pointerId:number;target:HTMLElement;frameAt:number;shift:boolean;points:number[];minimum:number;playing:boolean;lastStart:number;lastEnd:number;moved:boolean;length:number;lastFade:number};
function GainLine({db,height,onPointerDown,onCommit,base=false}:{db:number;height:number;onPointerDown:(e:React.PointerEvent)=>void;onCommit:(n:number)=>void;base?:boolean}){
  function key(e:React.KeyboardEvent){
    if(!['ArrowUp','ArrowDown','Home'].includes(e.key))return;
    e.preventDefault();e.stopPropagation();
    const next=e.key==='Home'?0:db+(e.key==='ArrowUp'?1:-1)*(e.shiftKey?.1:1);
    onCommit(Math.max(-96,Math.min(24,Math.round(next*10)/10)));
  }
  return <button data-gain-line role="slider" aria-label={base?'Base video volume':'Clip volume'} aria-valuemin={-96} aria-valuemax={24} aria-valuenow={db} aria-valuetext={gainLabel(db)} title={`${gainLabel(db)} · drag up/down · Shift: fine adjustment · double-click: 0 dB${base?' · all base video audio':''}`} className="absolute left-1 right-1 h-3 z-30 cursor-ns-resize outline-none group/gain" style={{top:gainLineTop(db,height)-6,touchAction:'none'}} onPointerDown={onPointerDown} onDoubleClick={e=>{e.preventDefault();e.stopPropagation();onCommit(0);}} onKeyDown={key}>
    <span className="absolute left-0 right-0 top-1/2 border-t border-white/65 group-hover/gain:border-yellow-200 group-focus-visible/gain:border-yellow-200 pointer-events-none"/>
  </button>;
}
function CompositionTimeline({videoRef}:{videoRef:RefObject<HTMLVideoElement|null>}){
  const {document,manifest,selectedId,timelineExpanded,timelineZoom,timelineWide,select,setDraft,draft,projectId,revision}=useCompositionStore();
  const previousWide=useRef(timelineWide);
  const words=useEditorStore(s=>s.words),backend=useEditorStore(s=>s.backendUrl),videoPath=useEditorStore(s=>s.videoPath);
  const [viewport,setViewport]=useState({start:0,end:1});
  const [dropView,setDropView]=useState<{time:number;track?:string}|null>(null),[importStatus,setImportStatus]=useState(''),[importError,setImportError]=useState('');
  const importing=useRef(false);
  const clips=useEditorStore(s=>s.clips);
  const narration=useEditorStore(s=>s.narration),[tool,setTool]=useState<'select'|'split'>('select');
  const cuts=useMemo(()=>editBoundaries({clips},manifest),[clips,manifest]);
  const basePieces=useMemo(()=>baseTimelineSegments(manifest,cuts,narration,clips),[manifest,cuts,narration,clips]);
  const [assets,setAssets]=useState<Record<string,Asset>>({}),[scrollTop,setScrollTop]=useState(0);const scroll=useRef<HTMLDivElement>(null),drag=useRef<ClipDrag|null>(null),dragFrame=useRef(0);
  const [dragView,setDragView]=useState<{start:number;end:number;x:number;snapped:number|null;mode:TimelineDragMode;fadeUs?:number;gainDb?:number}|null>(null);
  const wheelArea=useRef<HTMLDivElement>(null),zoomAnchor=useRef<{fraction:number;x:number}|null>(null);
  const scrub=useRef<{pointerId:number;x:number;playing:boolean;target:HTMLElement;lastTimeUs:number;frameAt:number}|null>(null),scrubFrame=useRef(0);
  const [scrubTime,setScrubTime]=useState<number|null>(null);
  const plan=useMemo(()=>manifest?compileComposition({...document,elements:{...document.elements,...(draft?{[draft.id]:draft}:{})}},manifest,words):null,[document,manifest,words,draft]);
  const layoutPlan=useMemo(()=>manifest?compileComposition(document,manifest,words):null,[document,manifest,words]);
  const trackLayouts=useMemo(()=>document.tracks.map(track=>{const elements=(layoutPlan?.elements||[]).filter(e=>e.id!=='base'&&e.trackId===track.id&&!e.suppressed),lanes=timelineLanes(elements),row=track.id==='base'?62:track.kind==='audio'?68:track.id==='text'?38:56;return {...track,...lanes,row,height:track.id==='base'?62:elements.length?lanes.count*row:28};}),[document.tracks,layoutPlan]);
  useEffect(()=>{let live=true;if(projectId)void window.electronAPI?.getRenderDocument(projectId).then(d=>{if(live)setAssets(d.composition?.assets||{});}).catch(()=>{});return()=>{live=false;};},[projectId,revision]);
  useLayoutEffect(()=>{
    const node=scroll.current;if(!node)return;
    const anchor=zoomAnchor.current;if(anchor){node.scrollLeft=anchor.fraction*node.scrollWidth-anchor.x;zoomAnchor.current=null;}
    else if(previousWide.current!==timelineWide)node.scrollLeft=viewport.start*node.scrollWidth;
    previousWide.current=timelineWide;
    setViewport({start:node.scrollLeft/node.scrollWidth,end:(node.scrollLeft+node.clientWidth)/node.scrollWidth});
  },[timelineZoom,timelineWide,!!plan]);
  useEffect(()=>{const node=scroll.current;if(!node)return;const observer=new ResizeObserver(()=>setViewport({start:node.scrollLeft/node.scrollWidth,end:(node.scrollLeft+node.clientWidth)/node.scrollWidth}));observer.observe(node);return()=>observer.disconnect();},[!!plan]);
  useEffect(()=>{
    const area=wheelArea.current;if(!area)return;
    const wheel=(event:WheelEvent)=>{
      if(!event.altKey&&!event.ctrlKey)return;
      const node=scroll.current;if(!node)return;
      // Native non-passive handling prevents Chromium's Ctrl+wheel page zoom.
      event.preventDefault();event.stopPropagation();
      const delta=(event.deltaY||event.deltaX)*(event.deltaMode===1?16:event.deltaMode===2?node.clientWidth:1);
      if(event.altKey){
        if(drag.current||scrub.current)return;
        const current=useCompositionStore.getState().timelineZoom,next=Math.max(1,Math.min(MAX_TIMELINE_ZOOM,current*Math.exp(-Math.max(-600,Math.min(600,delta))*.002)));
        if(next===current)return;
        const x=Math.max(0,Math.min(node.clientWidth,event.clientX-node.getBoundingClientRect().left));
        zoomAnchor.current={fraction:(node.scrollLeft+x)/node.scrollWidth,x};
        useCompositionStore.setState({timelineZoom:next});
      }else node.scrollLeft+=delta;
    };
    area.addEventListener('wheel',wheel,{passive:false});return()=>area.removeEventListener('wheel',wheel);
  },[!!plan]);
  function stopScrub(resume=true){
    const active=scrub.current;scrub.current=null;cancelAnimationFrame(scrubFrame.current);setScrubTime(null);
    if(active?.target.hasPointerCapture(active.pointerId))active.target.releasePointerCapture(active.pointerId);
    if(resume&&active?.playing)void videoRef.current?.play().catch(()=>{});
  }
  function releaseDrag(){const active=drag.current;if(active)useCompositionStore.setState({timelineGesture:false});drag.current=null;cancelAnimationFrame(dragFrame.current);setDragView(null);if(active?.target.hasPointerCapture(active.pointerId))active.target.releasePointerCapture(active.pointerId);if(active?.playing)void videoRef.current?.play().catch(()=>{});return active;}
  function cancelDrag(){if(releaseDrag())setDraft(null);}
  useEffect(()=>{setScrubTime(null);setDragView(null);return()=>{cancelAnimationFrame(scrubFrame.current);cancelAnimationFrame(dragFrame.current);scrub.current=null;if(drag.current){useCompositionStore.getState().setDraft(null);useCompositionStore.setState({timelineGesture:false});}drag.current=null;};},[videoPath,manifest?.inputRevision]);
  useEffect(()=>{const cancel=(e:KeyboardEvent)=>{if(drag.current)drag.current.shift=e.shiftKey;if(e.key==='Escape'){cancelDrag();stopScrub();}};const blur=()=>{cancelDrag();stopScrub(false);};window.addEventListener('keydown',cancel);window.addEventListener('keyup',cancel);window.addEventListener('blur',blur);return()=>{window.removeEventListener('keydown',cancel);window.removeEventListener('keyup',cancel);window.removeEventListener('blur',blur);};},[setDraft,videoRef]);
  useEffect(()=>{const change=(e:KeyboardEvent)=>{const t=e.target as HTMLElement;if(e.ctrlKey||e.metaKey||e.altKey||t.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(t.tagName)||drag.current||scrub.current)return;if(['b','v'].includes(e.key.toLowerCase())){e.preventDefault();setTool(e.key.toLowerCase()==='b'?'split':'select');}};window.addEventListener('keydown',change);return()=>window.removeEventListener('keydown',change);},[]);
  if(!plan||!manifest)return <div className="shrink-0 h-8 text-[10px] text-editor-text-muted pt-2">Preparing timeline…</div>;
  const duration=manifest.durationUs,pixelsPerUs=(scroll.current?.scrollWidth||0)/duration;
  function commitGain(element:Element,db:number){
    const state=useCompositionStore.getState();
    return commitComposition(element.id==='base'?[{type:'buses',buses:{...state.document.buses,voice:{...state.document.buses.voice,gainDb:db}},masterGainDb:state.document.masterGainDb}]:[{type:'update',id:element.id,changes:{audio:{...element.audio!,gainDb:db}}}],'Adjust clip volume').catch(error=>useCompositionStore.setState({error:String(error)}));
  }
  function cutAt(e:React.PointerEvent,elementId:string){
    e.preventDefault();e.stopPropagation();wheelArea.current?.focus({preventScroll:true});
    const node=scroll.current;if(e.button!==0||!node)return;
    const raw=(e.clientX-node.getBoundingClientRect().left+node.scrollLeft)/node.scrollWidth*duration,frame=1e6*document.canvas.fps.den/document.canvas.fps.num,at=Math.round(Math.round(raw/frame)*frame);
    const resolved=plan!.elements.find(item=>item.id===elementId);if(!resolved)return;
    try{
      const id=crypto.randomUUID();
      if(elementId==='base'){
        const source=editToSource(manifest!,at);if(!source)return;
        const next=splitNarrationAtSource({...useEditorStore.getState(),composition:document},source.clipId,source.sourceUs);
        if(next)void commitComposition([],'Split base video','manual',undefined,{narration:next}).catch(error=>useCompositionStore.setState({error:String(error)}));
      }else void commitComposition(splitElement(document,resolved,at,id),'Split timeline clip').then(()=>select(id)).catch(error=>useCompositionStore.setState({error:String(error)}));
    }catch(error){useCompositionStore.setState({error:String(error)});}
  }
  function fileDrag(event:React.DragEvent){return Array.from(event.dataTransfer.types).includes('Files');}
  function dropPosition(event:React.DragEvent){
    const node=scroll.current;if(!node)return {time:0};
    return {time:dropTime(event.clientX,node.getBoundingClientRect().left,node.scrollLeft,node.scrollWidth,duration),track:(event.target as HTMLElement).closest<HTMLElement>('[data-timeline-track]')?.dataset.timelineTrack};
  }
  function dragFiles(event:React.DragEvent){
    if(!fileDrag(event))return;
    event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect=importing.current?'none':'copy';
    if(!importing.current){setDropView(dropPosition(event));useCompositionStore.setState({timelineExpanded:true});}
  }
  async function receiveFiles(event:React.DragEvent){
    if(!fileDrag(event))return;
    event.preventDefault();event.stopPropagation();setDropView(null);
    if(importing.current)return;
    const files=Array.from(event.dataTransfer.files),position=dropPosition(event);
    importing.current=true;setImportError('');
    try{await dropTimelineMedia(files,position.time,position.track,setImportStatus);}
    catch(error){setImportError(String(error));}
    finally{importing.current=false;setImportStatus('');}
  }
  function seekEdited(timeUs:number){const source=editToSource(manifest!,Math.max(0,Math.min(duration-1,Math.round(timeUs))));if(videoRef.current&&source)seekSourceTime(videoRef.current,source.globalSourceUs/1e6);}
  function scrubAt(clientX:number){
    const tracks=scroll.current?.querySelector('[data-tracks]');if(!tracks)return;
    const rect=tracks.getBoundingClientRect(),timeUs=Math.round(Math.max(0,Math.min(1,(clientX-rect.left)/rect.width))*Math.max(0,duration-1));
    if(scrub.current&&timeUs!==scrub.current.lastTimeUs){scrub.current.lastTimeUs=timeUs;setScrubTime(timeUs);seekEdited(timeUs);}
  }
  function beginScrub(e:React.PointerEvent<HTMLElement>){
    if(e.button!==0||!videoRef.current)return;wheelArea.current?.focus({preventScroll:true});e.preventDefault();e.stopPropagation();
    const playing=!videoRef.current.paused;videoRef.current.pause();e.currentTarget.setPointerCapture(e.pointerId);
    scrub.current={pointerId:e.pointerId,x:e.clientX,playing,target:e.currentTarget,lastTimeUs:-1,frameAt:performance.now()};scrubAt(e.clientX);
    const tick=(now:number)=>{
      const active=scrub.current,node=scroll.current;if(!active||!node)return;
      if(now-active.frameAt>=32){
        const rect=node.getBoundingClientRect(),dt=Math.min(50,now-active.frameAt)/1000;
        const speed=active.x<rect.left+20?-Math.min(600,(rect.left+20-active.x)*12):active.x>rect.left+node.clientWidth-20?Math.min(600,(active.x-rect.left-node.clientWidth+20)*12):0;
        node.scrollLeft+=speed*dt;active.frameAt=now;scrubAt(active.x);
      }
      scrubFrame.current=requestAnimationFrame(tick);
    };scrubFrame.current=requestAnimationFrame(tick);
  }
  function updateDrag(){
    const d=drag.current,node=scroll.current;if(!d||!node)return;
    if(d.mode==='gain'){
      if(!d.moved&&Math.abs(d.y-d.originY)<2)return;d.moved=true;
      const gainDb=dragGain(d.originalGain,d.y-d.originY,d.shift);d.lastGain=gainDb;
      setDragView({start:d.start,end:d.end,x:d.x-node.getBoundingClientRect().left,snapped:null,mode:'gain',gainDb});
      if(d.element.id!=='base')setDraft({...d.element,audio:{...d.element.audio!,gainDb}});return;
    }
    const pixels=d.x-node.getBoundingClientRect().left+node.scrollLeft-d.originX;
    if(!d.moved&&Math.abs(pixels)<2)return;d.moved=true;
    const delta=pixels/d.width*d.duration;
    if(d.mode==='fadeIn'||d.mode==='fadeOut'){
      const original=d.element.audio!,offset=original.envelopeWindow?.offsetUs||0,total=original.envelopeWindow?.durationUs||d.length;
      const localIn=Math.max(0,Math.min(d.length,original.fadeInUs-offset)),localOut=Math.max(0,Math.min(d.length,offset+d.length-(total-original.fadeOutUs)));
      const fade=fadeDuration(d.mode==='fadeIn'?localIn:localOut,delta,d.mode,d.length);
      const resolved=plan!.elements.find(e=>e.id===d.element.id),spans=resolved?.activeSpans||[{startUs:d.start,endUs:d.end,elapsedUs:0}];
      const at=timeAtElapsed(spans,d.mode==='fadeIn'?fade:d.length-fade);
      setDragView({start:d.start,end:d.end,x:d.x-node.getBoundingClientRect().left,snapped:at,mode:d.mode,fadeUs:fade});
      if(d.lastFade!==fade){d.lastFade=fade;setDraft({...d.element,audio:{...original,envelopeWindow:null,fadeInUs:localIn,fadeOutUs:localOut,[d.mode==='fadeIn'?'fadeInUs':'fadeOutUs']:fade}});}return;
    }
    const range=dragRange({...d,mode:d.mode},delta,d.minimum,d.shift?[]:d.points,Math.min(150000,8/d.width*d.duration));
    setDragView({...range,x:Math.max(0,Math.min(node.clientWidth,d.x-node.getBoundingClientRect().left)),mode:d.mode});
    if(range.start===d.lastStart&&range.end===d.lastEnd)return;
    d.lastStart=range.start;d.lastEnd=range.end;
    setDraft(dragElement(d.element,d.start,d.end,range.start,range.end,d.mode,manifest!,words));
  }
  function start(e:React.PointerEvent,element:Element,start:number,end:number,mode:TimelineDragMode){
    const state=useCompositionStore.getState(),original=state.draft?.id===element.id?state.draft:state.document.elements[element.id],node=scroll.current,target=wheelArea.current;
    if(e.button!==0||element.id==='base'&&mode!=='gain'||!original||!node||!target)return;
    target.focus({preventScroll:true});e.preventDefault();e.stopPropagation();
    // Capture on the stable timeline, not a span/handle which can be replaced
    // when a speech anchor changes membership during a trim.
    select(element.id);useCompositionStore.setState({timelineGesture:true});target.setPointerCapture(e.pointerId);
    const playing=!!videoRef.current&&!videoRef.current.paused;videoRef.current?.pause();
    const playhead=scrubTime??sourceToEdit(manifest!,Math.round(useEditorStore.getState().currentTime*1e6))??0;
    const points=[0,duration,playhead,...basePieces.flatMap(p=>[p.startUs,p.endUs]),...plan!.elements.filter(p=>p.id!==element.id&&p.enabled&&!p.suppressed).flatMap(p=>(p.activeSpans||[p]).flatMap(s=>[s.startUs,s.endUs]))];
    const originalGain=element.id==='base'?document.buses.voice.gainDb:original.audio?.gainDb||0;
    drag.current={element:structuredClone(original),start,end,mode,duration,width:node.scrollWidth,originX:e.clientX-node.getBoundingClientRect().left+node.scrollLeft,x:e.clientX,originY:e.clientY,y:e.clientY,originalGain,lastGain:originalGain,pointerId:e.pointerId,target,frameAt:performance.now(),shift:e.shiftKey,points:[...new Set(points)],minimum:Math.max(1,Math.round(1e6*document.canvas.fps.den/document.canvas.fps.num)),playing,lastStart:start,lastEnd:end,moved:false,length:plan!.elements.find(e=>e.id===element.id)?.activeDurationUs||end-start,lastFade:mode==='fadeIn'?Math.min(end-start,original.audio?.fadeInUs||0):mode==='fadeOut'?Math.min(end-start,original.audio?.fadeOutUs||0):-1};
    setDragView({start,end,x:e.clientX-node.getBoundingClientRect().left,snapped:null,mode,...(mode==='gain'?{gainDb:originalGain}:{})});
    const tick=(now:number)=>{const d=drag.current,n=scroll.current;if(!d||!n)return;const dt=Math.min(50,now-d.frameAt)/1000,r=n.getBoundingClientRect();const speed=!d.moved||d.mode==='gain'?0:d.x<r.left+28?-Math.min(800,(r.left+28-d.x)*14):d.x>r.left+n.clientWidth-28?Math.min(800,(d.x-r.left-n.clientWidth+28)*14):0;n.scrollLeft+=speed*dt;d.frameAt=now;updateDrag();dragFrame.current=requestAnimationFrame(tick);};dragFrame.current=requestAnimationFrame(tick);
  }
  function move(e:React.PointerEvent){if(scrub.current?.pointerId===e.pointerId){scrub.current.x=e.clientX;return;}const d=drag.current;if(d?.pointerId===e.pointerId){d.x=e.clientX;d.y=e.clientY;d.shift=e.shiftKey;}}
  function finish(e:React.PointerEvent){
    const active=drag.current;if(!active||active.pointerId!==e.pointerId)return;active.x=e.clientX;active.y=e.clientY;active.shift=e.shiftKey;updateDrag();
    const edit=useCompositionStore.getState().draft,d=releaseDrag();
    if(d?.mode==='gain'){if(d.lastGain!==d.originalGain)void commitGain(d.element,d.lastGain).finally(()=>{if(!drag.current)setDraft(null);});else setDraft(null);return;}
    const fading=d?.mode==='fadeIn'||d?.mode==='fadeOut',changed=d&&(fading?JSON.stringify(edit?.audio)!==JSON.stringify(d.element.audio):d.lastStart!==d.start||d.lastEnd!==d.end);
    if(d&&edit&&edit.id===d.element.id&&changed)void commitComposition([{type:'update',id:d.element.id,changes:fading?{audio:edit.audio}:{placement:edit.placement,sourceInUs:edit.sourceInUs,contentWindow:edit.contentWindow,audio:edit.audio}}],fading?'Adjust audio fade':d.mode==='move'?'Move timeline element':'Trim timeline element').catch(error=>useCompositionStore.setState({error:String(error)})).finally(()=>{if(!drag.current&&useCompositionStore.getState().draft===edit)setDraft(null);});else setDraft(null);
  }
  const visibleSeconds=duration/1e6/timelineZoom,targetStep=visibleSeconds/8;
  const magnitude=10**Math.floor(Math.log10(Math.max(.001,targetStep)));
  const tickStep=[1,2,5,10].map(n=>n*magnitude).find(n=>n>=targetStep)||magnitude*10;
  const firstTick=Math.max(0,Math.floor(viewport.start*duration/1e6/tickStep));
  const lastTick=Math.min(Math.ceil(duration/1e6/tickStep),Math.ceil(viewport.end*duration/1e6/tickStep));
  const ticks=Array.from({length:Math.max(0,Math.min(100,lastTick-firstTick+1))},(_,i)=>Math.round((firstTick+i)*tickStep*1e6)/1e6).filter(t=>t*1e6<=duration);
  const tickLabel=(t:number)=>`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}${tickStep<1?`.${String(Math.round(t%1*1000)).padStart(3,'0')}`:''}`;
  return <div ref={wheelArea} onDragEnter={dragFiles} onDragOver={dragFiles} onDrop={event=>void receiveFiles(event)} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setDropView(null);}} tabIndex={-1} aria-label="Timeline" title="Alt + mouse wheel: zoom · Ctrl + mouse wheel: scroll horizontally · Hold Shift while dragging to disable snapping" className="flex-1 min-h-0 flex flex-col border-t border-editor-border text-[10px] min-w-0 outline-none select-none" onPointerMove={move} onPointerUp={e=>{if(scrub.current?.pointerId===e.pointerId){scrubAt(e.clientX);stopScrub();}else finish(e);}} onPointerCancel={()=>{stopScrub();cancelDrag();}} onLostPointerCapture={e=>{if(drag.current?.pointerId===e.pointerId)cancelDrag();}}>
    <div className="flex items-center gap-2 py-1"><div role="toolbar" aria-label="Timeline tools" className="flex gap-1 shrink-0"><button aria-label="Selection tool" aria-pressed={tool==='select'} title="Select / move (V)" onClick={()=>setTool('select')} className={`px-2 py-1 rounded ${tool==='select'?'bg-violet-500 text-white':'text-editor-text-muted'}`}>↖ V</button><button aria-label="Split tool" aria-pressed={tool==='split'} title="Split clip (B)" onClick={()=>setTool('split')} className={`px-2 py-1 rounded ${tool==='split'?'bg-violet-500 text-white':'text-editor-text-muted'}`}>✂ B</button></div><button onClick={()=>useCompositionStore.setState({timelineExpanded:!timelineExpanded})} className="text-editor-text-muted">{timelineExpanded?'▾':'▸'} Layers · {(duration/1e6).toFixed(1)}s</button>
      <span className="flex-1 min-w-0 truncate text-yellow-200 tabular-nums">{dragView&&<span data-timeline-drag data-start-us={dragView.start} data-end-us={dragView.end} role="status">{dragView.mode==='gain'?'Volume':dragView.mode==='fadeIn'?'Fade in':dragView.mode==='fadeOut'?'Fade out':dragView.mode==='move'?'Move':'Trim'} · {dragView.mode==='gain'?gainLabel(dragView.gainDb!):<>{(dragView.start/1e6).toFixed(3)}–{(dragView.end/1e6).toFixed(3)}s · {((dragView.fadeUs??(dragView.end-dragView.start))/1e6).toFixed(3)}s{dragView.fadeUs===undefined&&dragView.snapped!==null?' · Snapped':''}</>}</span>}</span><button aria-label="Zoom out" onClick={()=>useCompositionStore.setState({timelineZoom:Math.max(1,timelineZoom/1.5)})}>−</button><span>{timelineZoom.toFixed(1)}×</span><button aria-label="Zoom in" onClick={()=>useCompositionStore.setState({timelineZoom:Math.min(MAX_TIMELINE_ZOOM,timelineZoom*1.5)})}>+</button><button aria-label={timelineWide?'Restore timeline width':'Maximize timeline width'} aria-pressed={timelineWide} title={timelineWide?'Restore timeline width':'Maximize timeline width'} onClick={()=>useCompositionStore.setState({timelineWide:!timelineWide})} className="ml-1 p-1 shrink-0 rounded text-editor-text-muted hover:text-editor-text hover:bg-editor-surface focus-visible:outline focus-visible:outline-1 focus-visible:outline-editor-accent">{timelineWide?<Minimize2 size={14}/>:<Maximize2 size={14}/>}</button>
    </div>

    {(importStatus||importError||dropView)&&<div data-timeline-import-status role="status" className={`px-1 py-1 ${importError?'text-editor-danger':'text-cyan-200'}`}>{importStatus||importError||`Drop media at ${(dropView!.time/1e6).toFixed(3)}s · audio → ${dropView!.track==='sound'?'Sounds':'Music'}, video/images → Visuals`}</div>}
    <TimelineOverview scroll={scroll} viewport={viewport} duration={duration} cuts={basePieces.slice(1).map(p=>p.startUs)} onRange={(start,end)=>{zoomAnchor.current={fraction:start,x:0};useCompositionStore.setState({timelineZoom:Math.max(1,Math.min(1000,1/(end-start)))});}}/>
    <div className="relative flex-1 min-h-0">
      <div data-track-labels className="absolute left-0 top-0 bottom-0 w-20 overflow-hidden pointer-events-none border-r border-editor-border">
        <div style={{transform:`translateY(${-scrollTop}px)`}}><div className="h-5"/>{(timelineExpanded?trackLayouts:trackLayouts.slice(0,1)).map(track=><div key={track.id} className="px-1 pt-2 text-editor-text-muted border-t border-editor-border/50 truncate" style={{height:track.height}} title={track.name}>{track.name}{track.id==='base'&&<span className="block text-[9px]">Locked</span>}</div>)}</div>
      </div>
      <div ref={scroll} onScroll={e=>{const node=e.currentTarget;setScrollTop(node.scrollTop);setViewport({start:node.scrollLeft/node.scrollWidth,end:(node.scrollLeft+node.clientWidth)/node.scrollWidth});}} className="h-full overflow-auto ml-20">
      <div data-tracks className="relative" style={{width:`${timelineZoom*100}%`,minWidth:'100%',overflow:'hidden'}}>
        <div data-timeline-ruler className="relative h-5 cursor-ew-resize text-editor-text-muted" style={{touchAction:'none'}} onPointerDown={e=>{if(e.target===e.currentTarget)beginScrub(e);}} onLostPointerCapture={()=>{if(scrub.current)stopScrub();}}>
          {ticks.map(t=><span key={t} data-timeline-tick className="absolute pointer-events-none" style={{left:`${t*1e6/duration*100}%`}}>{tickLabel(t)}</span>)}
          {cuts.silenceRemovals.flatMap(cut=>(cut.editTimesUs||[]).map(time=><button key={`${cut.id}:${time}`} data-silence-cut={cut.id} aria-label="Silence removal" title={`Silence removal · ${(cut.removedUs/1e6).toFixed(2)}s removed`} className="absolute bottom-0 h-2 w-1 bg-amber-400" style={{left:`${time/duration*100}%`}} onPointerDown={e=>{e.stopPropagation();if(videoRef.current)seekSourceTime(videoRef.current,cut.globalSourceUs/1e6);}}/>))}
        </div>
        {(timelineExpanded?trackLayouts:trackLayouts.slice(0,1)).map(track=><div key={track.id} data-timeline-track={track.id} className="relative border-t border-editor-border/50" style={{height:track.height}}>
          {document.elements.base?.trackId===track.id&&basePieces.filter(piece=>piece.endUs/duration>=viewport.start&&piece.startUs/duration<=viewport.end).map(piece=>{
            const source=editToSource(manifest,piece.startUs)?.globalSourceUs||0;
            return <div key={piece.id} data-base-piece={piece.id} data-start-us={piece.startUs} data-end-us={piece.endUs} data-cut-kinds={piece.cutKinds.join(',')} aria-label="Base video fragment (locked)" title={`${clips.find(c=>c.id===piece.clipId)?.name||'Base video'} · ${(piece.startUs/1e6).toFixed(3)}–${(piece.endUs/1e6).toFixed(3)}s · ${piece.cutKinds.join(', ')} · Locked`} className="absolute top-1 overflow-hidden bg-violet-800/40 border-y border-violet-400/40 cursor-ew-resize" style={{height:track.row-8,left:`${piece.startUs/duration*100}%`,width:`${(piece.endUs-piece.startUs)/duration*100}%`,borderLeft:'1px solid',borderLeftColor:piece.cutKinds.includes('edit-removal')?'#fb7185':piece.cutKinds.includes('silence-removal')?'#fbbf24':'#a78bfa',touchAction:'none'}} onPointerDown={e=>{if(tool==='split')cutAt(e,'base');else{beginScrub(e);select('base');}}} onLostPointerCapture={()=>{if(scrub.current)stopScrub();}}>
              <span className="px-1 whitespace-nowrap pointer-events-none">{clips.find(c=>c.id===piece.clipId)?.name||'Base video'}</span>
              <TimelineWaveform pixelsPerUs={pixelsPerUs} detail={timelineZoom>8} backend={backend} path={videoPath||''} startUs={piece.startUs} endUs={piece.endUs} sourceInUs={source} gainDb={document.buses.voice.gainDb} sourceDurationUs={useEditorStore.getState().duration*1e6} visibleStart={viewport.start*duration} visibleEnd={viewport.end*duration}/>
              <GainLine base db={drag.current?.element.id==='base'&&dragView?.mode==='gain'?dragView.gainDb!:document.buses.voice.gainDb} height={track.row-8} onPointerDown={e=>tool==='split'?cutAt(e,'base'):start(e,document.elements.base,0,duration,'gain')} onCommit={db=>void commitGain(document.elements.base,db)}/>
            </div>;
          })}
          {plan.elements.filter(e=>e.id!=='base'&&e.trackId===track.id&&!e.suppressed&&(e.id===selectedId||e.endUs/duration>=viewport.start&&e.startUs/duration<=viewport.end)).flatMap(element=>(element.activeSpans||[{startUs:element.startUs,endUs:element.endUs,elapsedUs:0}]).map((span,spanIndex,spans)=>{
            const asset=assets[element.assetId||''],length=element.activeDurationUs||element.endUs-element.startUs;
            const fadeIn=element.audio?.fadeInUs||0,fadeOut=element.audio?.fadeOutUs||0,audioOffset=element.audio?.envelopeWindow?.offsetUs||0,audioTotal=element.audio?.envelopeWindow?.durationUs||length;
            const fadeInAt=timeAtElapsed(spans,Math.max(0,Math.min(length,fadeIn-audioOffset))),fadeOutAt=timeAtElapsed(spans,Math.max(0,Math.min(length,audioTotal-fadeOut-audioOffset)));
            const envelope=fadeEnvelopePoints(audioOffset+span.elapsedUs,span.endUs-span.startUs,audioTotal,fadeIn,fadeOut),envelopeLine=envelope.map(p=>`${p.x},${p.y}`).join(' ');
            const hasFade=(at:number)=>at>=span.startUs&&(at<span.endUs||spanIndex===spans.length-1&&at===span.endUs);
            return <div key={`${element.id}:${spanIndex}`} data-element-id={element.id} data-span-index={spanIndex} data-start-us={span.startUs} data-end-us={span.endUs} data-fade-in-us={fadeIn} data-fade-out-us={fadeOut} title={`${element.label} · ${(element.startUs/1e6).toFixed(3)}–${(element.endUs/1e6).toFixed(3)}s`} className={`group absolute rounded cursor-grab border ${element.kind==='audio'?(element.id===selectedId?'border-emerald-100 bg-[#32664b]':'border-emerald-700/70 bg-[#214e3a]'):(element.id===selectedId?'border-white bg-violet-500/70':'border-violet-400/40 bg-violet-800/40')}`} style={{cursor:tool==='split'?'crosshair':undefined,top:(track.byId[element.id]||0)*track.row+4,height:track.row-8,left:`${span.startUs/duration*100}%`,width:`${(span.endUs-span.startUs)/duration*100}%`,touchAction:'none'}} onPointerDown={e=>tool==='split'?cutAt(e,element.id):start(e,element,element.startUs,element.endUs,'move')} onDoubleClick={()=>window.dispatchEvent(new CustomEvent('edity:inspect-media'))}>
              {spanIndex===0&&<button aria-label="Trim start" title="Drag start · Shift: no snapping" className={`absolute top-0 h-full w-3 cursor-ew-resize rounded-l border-r-2 border-white ${element.kind==='audio'?'bg-emerald-300/20':'bg-violet-300/60'} ${element.id===selectedId?'z-40 opacity-100':'z-30 opacity-30 group-hover:opacity-100'}`} style={{touchAction:'none',left:span.startUs===0?0:-12,width:span.startUs===0?6:12}} onDoubleClick={e=>e.stopPropagation()} onPointerDown={e=>tool==='split'?cutAt(e,element.id):start(e,element,element.startUs,element.endUs,'start')}/>}
              <span className={`block h-4 overflow-hidden px-2 whitespace-nowrap pointer-events-none ${element.kind==='audio'?'bg-[#173c2c] text-emerald-50/90':''}`}>{element.kind==='text'?element.text:element.label}</span>
              {asset?.thumbnailPath&&['image','video'].includes(element.kind)&&<img data-clip-thumbnail src={`${backend}/file?path=${encodeURIComponent(asset.thumbnailPath)}`} className="absolute left-1 top-4 h-7 w-12 object-cover pointer-events-none opacity-70"/>}
              {asset?.hasAudio&&<TimelineWaveform pixelsPerUs={pixelsPerUs} detail={timelineZoom>8} backend={backend} path={asset.path} startUs={span.startUs} endUs={span.endUs} phaseUs={span.elapsedUs+(element.contentWindow?.offsetUs||0)} gainDb={element.audio?.gainDb||0} sourceInUs={element.sourceInUs} sourceDurationUs={asset.durationUs} loop={element.endPolicy==='loop'} visibleStart={viewport.start*duration} visibleEnd={viewport.end*duration} totalUs={length}/>}
              {element.audio&&<>
                <svg data-fade-envelope aria-hidden className="absolute left-0 w-full pointer-events-none overflow-hidden" style={{top:20,height:'calc(100% - 20px)'}} viewBox="0 0 100 100" preserveAspectRatio="none">
                  <polygon data-fade-shade points={`0,0 ${envelopeLine} 100,0`} fill="black" fillOpacity=".38"/>
                  <polyline data-fade-line points={envelopeLine} stroke="white" strokeOpacity=".65" strokeWidth=".8" fill="none" vectorEffect="non-scaling-stroke"/>
                </svg>
                {hasFade(fadeInAt)&&<button aria-label="Fade in" title={`Fade in · ${(fadeIn/1e6).toFixed(3)}s · drag right to lengthen`} className="absolute w-3.5 h-3.5 cursor-ew-resize z-50 flex items-center justify-center" style={{top:13,left:`clamp(0px, calc(${(fadeInAt-span.startUs)/(span.endUs-span.startUs)*100}% - 7px), calc(100% - 14px))`,touchAction:'none'}} onPointerDown={e=>tool==='split'?cutAt(e,element.id):start(e,element,element.startUs,element.endUs,'fadeIn')} onDoubleClick={e=>e.stopPropagation()}><span data-fade-handle className="w-[7px] h-[7px] rounded-full bg-white border border-black/50 shadow-sm pointer-events-none"/></button>}
                {hasFade(fadeOutAt)&&<button aria-label="Fade out" title={`Fade out · ${(fadeOut/1e6).toFixed(3)}s · drag left to lengthen`} className="absolute w-3.5 h-3.5 cursor-ew-resize z-50 flex items-center justify-center" style={{top:13,left:`clamp(0px, calc(${(fadeOutAt-span.startUs)/(span.endUs-span.startUs)*100}% - 7px), calc(100% - 14px))`,touchAction:'none'}} onPointerDown={e=>tool==='split'?cutAt(e,element.id):start(e,element,element.startUs,element.endUs,'fadeOut')} onDoubleClick={e=>e.stopPropagation()}><span data-fade-handle className="w-[7px] h-[7px] rounded-full bg-white border border-black/50 shadow-sm pointer-events-none"/></button>}

              </>}
              {element.audio&&asset?.hasAudio&&<GainLine db={element.audio.gainDb} height={track.row-8} onPointerDown={e=>tool==='split'?cutAt(e,element.id):start(e,element,element.startUs,element.endUs,'gain')} onCommit={db=>void commitGain(element,db)}/>}
              {spanIndex===spans.length-1&&<button aria-label="Trim end" title="Drag end · Shift: no snapping" className={`absolute top-0 h-full w-3 cursor-ew-resize rounded-r border-l-2 border-white ${element.kind==='audio'?'bg-emerald-300/20':'bg-violet-300/60'} ${element.id===selectedId?'z-40 opacity-100':'z-30 opacity-30 group-hover:opacity-100'}`} style={{touchAction:'none',right:span.endUs===duration?0:-12,width:span.endUs===duration?6:12}} onDoubleClick={e=>e.stopPropagation()} onPointerDown={e=>tool==='split'?cutAt(e,element.id):start(e,element,element.startUs,element.endUs,'end')}/>}
            </div>;
          }))}
        </div>)}
        {dropView&&<div data-media-drop-guide className="absolute top-0 bottom-0 z-50 w-px bg-cyan-300 pointer-events-none" style={{left:`${dropView.time/duration*100}%`}}/>}
        {dragView&&dragView.mode!=='gain'&&<div data-drag-guide className={`absolute top-0 bottom-0 z-20 w-px pointer-events-none ${dragView.snapped!==null?'bg-cyan-300':'bg-white/70'}`} style={{left:`${(dragView.snapped??(dragView.mode==='start'?dragView.start:dragView.end))/duration*100}%`}}/>}
        <TimelinePlayhead manifest={manifest} scrubTime={scrubTime} split={tool==='split'} onPointerDown={e=>tool==='split'?cutAt(e,'base'):beginScrub(e)} onLostPointerCapture={()=>{if(scrub.current)stopScrub();}} onSeek={seekEdited}/>
      </div>
    </div>
    </div>
  </div>;
}

export default memo(CompositionTimeline);
