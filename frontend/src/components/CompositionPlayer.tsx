import {isColorGraded} from '../composition/colorGrade';
import {memo,useEffect,useMemo,useRef,useState} from 'react';
import type {RefObject} from 'react';
import {useCompositionStore} from '../store/compositionStore';
import {useEditorStore} from '../store/editorStore';
import {compileComposition,evaluateFrame} from '../composition/compiler';
import {sourceToEdit,visualTimingRequest} from '../composition/timeMap';
import {currentManifestRequest,requestManifest} from '../composition/manifestClient';
import {Compositor} from '../render/compositor';
import type {FrameSource} from '../render/compositor';
import {FrameProvider} from '../render/frameProvider';
import {abortable} from '../render/abortable';
import {loadCompositionFonts} from '../render/textRasterizer';
import {hasInstantController,sourceTimeAt} from '../lib/playbackTime';
import type {CompositionDocument,RenderPlan} from '../composition/types';
import ViewerManipulationLayer from './ViewerManipulationLayer';
import {useCompositionAudio} from '../hooks/useCompositionAudio';
import {withCaptions} from '../composition/captions';
import {editedOffsetAt} from '../lib/instantTimeline';
import {previewSize,type PlaybackQuality} from '../lib/playbackQuality';
function CompositionPlayer({videoRef,quality='auto',interactive=true}:{videoRef:RefObject<HTMLVideoElement|null>;quality?:PlaybackQuality;interactive?:boolean}){
  const {document,manifest,revision,projectId,draft,captionsPreview,colorPreview,timelineGesture}=useCompositionStore();
  const [visible,setVisible]=useState(true);
  useEffect(()=>window.electronAPI?.onWorkspaceVisibility(value=>{setVisible(value);if(!value)videoRef.current?.pause();}),[videoRef]);
  const words=useEditorStore(s=>s.words),backend=useEditorStore(s=>s.backendUrl);
  const [resolved,setResolved]=useState<CompositionDocument|null>(null),[error,setError]=useState(''),[timeUs,setTimeUs]=useState(0);
  const visualKey=useMemo(()=>JSON.stringify(visualTimingRequest({composition:document,words,clips:useEditorStore.getState().clips,deletedRanges:useEditorStore.getState().deletedRanges})),[document,words,manifest?.inputRevision]);
  useEffect(()=>{
    if(!manifest)return;let live=true;const inputRevision=manifest.inputRevision,project=projectId;
    // Keep the cut/audio manifest usable while local visual alignment warms.
    void requestManifest(backend,{...currentManifestRequest(),...JSON.parse(visualKey)}).then(aligned=>{
      const store=useCompositionStore.getState();
      if(live&&store.projectId===project&&store.manifest?.inputRevision===inputRevision)store.setManifest(aligned);
    }).catch(e=>console.warn('Visual word timing unavailable:',e));
    return()=>{live=false;};
  },[backend,projectId,manifest?.inputRevision,visualKey]);
  const container=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null);
  const [size,setSize]=useState({width:640,height:360});
  useEffect(()=>{let live=true;if(projectId&&window.electronAPI)void window.electronAPI.getRenderDocument(projectId).then(p=>{if(live)setResolved(previous=>JSON.stringify(previous)===JSON.stringify(p.composition||null)?previous:p.composition||null);}).catch(e=>{if(live)setError(String(e));});return()=>{live=false;};},[projectId,revision]);
  const plan=useMemo(()=>{
    if(!manifest||!resolved)return null;
    try{let doc={...document,assets:resolved.assets,elements:{...document.elements,...(draft?{[draft.id]:draft}:{})}};if(colorPreview){if(colorPreview.scope==='source')doc={...doc,sourceGrades:{...doc.sourceGrades,[colorPreview.id]:colorPreview.grade}};else if(doc.elements[colorPreview.id])doc={...doc,elements:{...doc.elements,[colorPreview.id]:{...doc.elements[colorPreview.id],colorGrade:colorPreview.grade}}};}return compileComposition(captionsPreview?withCaptions(doc,words,manifest,useEditorStore.getState().deletedRanges.flatMap(r=>r.wordIndices)):doc,manifest,words);}catch(e){return null;}
  },[document,resolved,manifest,words,draft,captionsPreview,colorPreview]);
  const planRef=useRef<RenderPlan|null>(plan);planRef.current=plan;
  // Timeline gestures pause playback; build supplemental audio once after commit,
  // rather than creating contexts/mixes for every drag animation frame.
  useCompositionAudio(videoRef,visible&&!timelineGesture?plan:null);
  useEffect(()=>{const node=container.current;if(!node)return;const observer=new ResizeObserver(()=>{const rect=node.getBoundingClientRect(),aspect=document.canvas.width/document.canvas.height;const width=Math.min(rect.width,rect.height*aspect);setSize({width,height:width/aspect});});observer.observe(node);return()=>observer.disconnect();},[document.canvas.width,document.canvas.height]);
  useEffect(()=>{
    if(!visible||!canvas.current)return;const compositor=new Compositor(canvas.current),provider=new FrameProvider(backend,quality);
    let live=true,busy=false,raf=0,previousSeek=0,lastError='',lastTime=0,lastDrawAt=0,lastEditUs=-1;
    let fontPlan:RenderPlan|null=null,fontLoad:Promise<void>|null=null,drawnPlan:RenderPlan|null=null;
    let workController=new AbortController();
    const warmed=new Map<string,number>();
    const video=videoRef.current;
    const transparent=window.document.createElement('canvas');transparent.width=transparent.height=1;
    const seek=()=>{previousSeek++;lastEditUs=-1;workController.abort();workController=new AbortController();provider.invalidate();warmed.clear();};
    // currentTime changes before the new decoded picture is available. A paused
    // draw made during seeking must not be cached as the destination frame.
    const presented=()=>{lastEditUs=-1;};
    const nativeSeek=()=>{if(video&&!hasInstantController(video))seek();};
    video?.addEventListener('edity-seek',seek);video?.addEventListener('seeking',nativeSeek);
    video?.addEventListener('seeked',presented);video?.addEventListener('play',seek);video?.addEventListener('pause',seek);
    const tick=async()=>{
      raf=requestAnimationFrame(()=>void tick());if(!live||busy)return;
      const current=planRef.current,v=videoRef.current;if(!current||!v||v.readyState<2||v.seeking)return;
      const sourceTime=sourceTimeAt(v);
      const editUs=sourceToEdit(current.manifest,Math.round(sourceTime*1e6))??Math.min(current.manifest.durationUs-1,Math.round(editedOffsetAt(current.manifest.keepSegments,sourceTime)*1e6));
      const now=performance.now();
      // Prime the next inserts while A-roll is still visible. Decoder loading
      // and its initial seek must not first start at the B-roll boundary.
      const upcoming=current.elements.filter(e=>e.enabled&&!e.suppressed&&['video','image'].includes(e.kind)&&e.endUs>editUs)
        .sort((a,b)=>a.startUs-b.startUs);
      for(const element of upcoming){
        const asset=current.document.assets[element.assetId!];if(!asset||asset.status!=='ready')continue;
        provider.prepare(asset);
        const spans=element.activeSpans||[{startUs:element.startUs,endUs:element.endUs}];
        if(spans.some(span=>span.startUs<=editUs&&editUs<span.endUs))continue;
        for(const span of spans){
          if(span.startUs<=editUs||span.startUs-editUs>2000000)continue;
          const key=`${element.id}:${span.startUs}`;if(now-(warmed.get(key)??-Infinity)<250)continue;warmed.set(key,now);
          const layer=evaluateFrame(current,span.startUs+1).find(layer=>layer.id===element.id);
          if(layer)void provider.frame(layer,asset,false,v.playbackRate).catch(()=>{warmed.delete(key);});
        }
      }
      if(current===drawnPlan&&lastEditUs>=0&&(v.paused&&editUs===lastEditUs||!v.paused&&now-lastDrawAt<1000/30-1))return;
      if(performance.now()-lastTime>80){setTimeUs(editUs);lastTime=performance.now();}
      const generation=previousSeek,signal=workController.signal;busy=true;
      try{
        if(fontPlan!==current){fontPlan=current;fontLoad=loadCompositionFonts(current.document,p=>provider.url(p));}
        if(fontLoad)await abortable(fontLoad,signal);
        const layers=evaluateFrame(current,editUs),frames=new Map<string,FrameSource>();
        await abortable(Promise.all(layers.filter(l=>l.element.kind!=='text').map(async layer=>{
          const asset=current.document.assets[layer.element.assetId!];if(!asset||asset.status!=='ready')throw new Error(`${asset?.name||layer.element.label}: ${asset?.status||'missing'}`);
          const isBase=(!v.paused||!isColorGraded(layer.colorGrade))&&layer.element.kind==='base'&&!layer.id.includes(':')&&!asset.normalizedPath;
          if(isBase){frames.set(layer.id,v);return;}
          const pending=provider.frame(layer,asset,!v.paused,v.playbackRate);
          if(v.paused){frames.set(layer.id,await pending);return;}
          // A cold decoder/seek must not stall the complete picture and A-roll.
          // Preloading normally makes this immediate. Paused inspection still
          // waits for the exact requested frame; exports use their own decoder.
          let timeout:ReturnType<typeof setTimeout>|undefined;
          try{
            const frame=await Promise.race([pending,new Promise<null>(resolve=>{timeout=setTimeout(()=>resolve(null),12);})]);
            const visibleFrame=frame||provider.available(layer)||transparent;
            if(visibleFrame instanceof HTMLVideoElement&&visibleFrame.paused)void visibleFrame.play().catch(()=>{});
            frames.set(layer.id,visibleFrame);
          }finally{if(timeout)clearTimeout(timeout);}
        })),signal);
        if(!live||generation!==previousSeek||current!==planRef.current)return;
        const resolution=previewSize(current.document.canvas.width,current.document.canvas.height,quality);
        compositor.draw(current,editUs,frames,resolution.width,resolution.height);
        lastEditUs=editUs;lastDrawAt=now;drawnPlan=current;
        provider.releaseInactive(new Set(layers.map(l=>l.id)));if(lastError){setError('');lastError='';}
      }catch(e){if(live&&generation===previousSeek&&!String(e).includes('Superseded')){const message=String(e);if(message!==lastError){lastError=message;setError(message);}}}finally{busy=false;}
    };void tick();
    return()=>{live=false;workController.abort();cancelAnimationFrame(raf);video?.removeEventListener('edity-seek',seek);video?.removeEventListener('seeking',nativeSeek);video?.removeEventListener('seeked',presented);video?.removeEventListener('play',seek);video?.removeEventListener('pause',seek);provider.dispose();compositor.dispose();};
  },[backend,videoRef,visible,quality]);
  return <div ref={container} className="absolute inset-0 flex items-center justify-center" style={{pointerEvents:plan?'auto':'none'}}>
    <div className="relative shrink-0" style={{width:size.width,height:size.height,visibility:plan?'visible':'hidden'}}>
      <canvas ref={canvas} className="w-full h-full" onClick={()=>{const v=videoRef.current;if(v){if(v.paused)void v.play();else v.pause();}}}/>
      {plan&&interactive&&<ViewerManipulationLayer plan={plan} timeUs={timeUs}/>}
    </div>
    {error&&<span className="absolute left-2 top-2 rounded bg-black/80 px-2 py-1 text-[10px] text-orange-300 max-w-[90%]">{error}</span>}
  </div>;
}
export default memo(CompositionPlayer);
