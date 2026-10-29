import {isColorGraded} from '../composition/colorGrade';
import type {Asset,FrameLayer} from '../composition/types';
import type {FrameSource,RgbaFrame} from './compositor';
import {abortable} from './abortable';
import {previewHeight,type PlaybackQuality} from '../lib/playbackQuality';
type Decoder={video:HTMLVideoElement;ready:Promise<void>;used:number;failed:boolean;assetKey:string;sourcePath:string;generation?:number;target?:number;requestedAt?:number};
export class FrameProvider {
  private lastRaw=new Map<string,RgbaFrame>();
  private inFlight=new Map<string,Promise<FrameSource>>();
  private previews=new Map<string,string|null>();private previewQueue:Promise<void>=Promise.resolve();private previewController=new AbortController();
  private decoders=new Map<string,Decoder>();private images=new Map<string,Promise<HTMLImageElement>>();private imageSizes=new Map<string,number>();
  private rgba=new Map<string,{frame:RgbaFrame;bytes:number;used:number}>();private generation=0;private disposed=false;private controller=new AbortController();private pending=new Map<string,Promise<RgbaFrame[]>>();private leasePaths=new Set<string>();private leaseTimer:ReturnType<typeof setInterval>;
  constructor(private backend:string,private quality:PlaybackQuality='auto'){this.leaseTimer=setInterval(()=>{if(this.leasePaths.size)void fetch(`${this.backend}/composition/lease`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paths:[...this.leasePaths]})}).catch(()=>{});},30000);}
  url(path:string){return `${this.backend}/file?path=${encodeURIComponent(path)}`;}
  invalidate(){this.generation++;this.controller.abort();this.controller=new AbortController();this.pending.clear();this.inFlight.clear();}
  prepare(asset:Asset){
    if(asset.kind!=='video'||asset.hasAlpha||this.quality==='original'||asset.previewPath&&this.quality==='auto'||this.previews.has(asset.path))return;
    this.previews.set(asset.path,null);
    this.previewQueue=this.previewQueue.then(async()=>{
      for(let attempt=0;attempt<180&&!this.disposed;attempt++){
        const response=await fetch(`${this.backend}/preview/${attempt?'status':'prepare'}`,{method:'POST',signal:this.previewController.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({video_path:asset.normalizedPath||asset.path,studio_sound:false,max_height:previewHeight(this.quality)})});
        if(!response.ok)return;const result=await response.json();
        if(result.status==='ready'&&result.path){this.previews.set(asset.path,result.path);return;}
        if(result.status!=='preparing')return;
        await new Promise(resolve=>setTimeout(resolve,500));
      }
    }).catch(()=>{});
  }
  frame(layer:FrameLayer,asset:Asset,playing:boolean,rate:number):Promise<FrameSource>{
    const key=`${this.generation}:${layer.id}:${asset.id}`;
    const current=this.inFlight.get(key);if(current)return current;
    const job=abortable(this.decode(layer,asset,playing,rate),this.controller.signal);this.inFlight.set(key,job);
    void job.finally(()=>{if(this.inFlight.get(key)===job)this.inFlight.delete(key);}).catch(()=>{});
    return job;
  }
  available(layer:FrameLayer):FrameSource|null {
    const decoder=this.decoders.get(layer.id),video=decoder?.video;
    return video&&decoder?.generation===this.generation&&!video.seeking&&video.readyState>=2?video:isColorGraded(layer.colorGrade)?this.lastRaw.get(layer.id)||null:null;
  }
  private async decode(layer:FrameLayer,asset:Asset,playing:boolean,rate:number):Promise<FrameSource>{
    if(this.disposed)throw new Error('Player released');const generation=this.generation;this.leasePaths.add(asset.previewPath||asset.normalizedPath||asset.path);
    if(asset.kind==='image'){
      const imagePath=this.quality!=='original'&&asset.width*asset.height>4000000&&asset.thumbnailPath?asset.thumbnailPath:asset.normalizedPath||asset.path;const imageKey=`${asset.id}:${asset.hash}:${imagePath}`;
      if(!this.images.has(imageKey))this.images.set(imageKey,new Promise((resolve,reject)=>{const image=new Image();image.crossOrigin='anonymous';image.onload=()=>resolve(image);image.onerror=()=>reject(new Error(`Cannot read ${asset.name}`));image.src=this.url(imagePath);}));
      const result=await abortable(this.images.get(imageKey)!,this.controller.signal);
      if(this.disposed||generation!==this.generation)throw new Error('Superseded seek');
      this.imageSizes.set(imageKey,result.naturalWidth*result.naturalHeight*4);let bytes=[...this.imageSizes.values()].reduce((n,b)=>n+b,0);for(const id of this.images.keys()){if(this.images.size<=16&&bytes<=64*1024*1024)break;if(id!==imageKey){bytes-=this.imageSizes.get(id)||0;this.images.delete(id);this.imageSizes.delete(id);}}
      return result;
    }
    if(asset.hasAlpha||isColorGraded(layer.colorGrade)&&!playing){const frame=await this.raw(layer,asset,generation);this.lastRaw.set(layer.id,frame);if(playing&&isColorGraded(layer.colorGrade)){const fps=(asset.fps?.num||30)/(asset.fps?.den||1),index=Math.round(layer.sourceTimeUs*fps/1e6);if(index%15>=8)void this.raw({...layer,sourceTimeUs:Math.round((Math.floor(index/15)+1)*15/fps*1e6)},asset,generation).catch(()=>{});}return frame;}
    // Keep a playing decoder's source stable when its proxy becomes available.
    // New activations use the optimized 720p/30 fps, short-GOP derivative.
    const source=this.quality==='original'?(asset.normalizedPath||asset.path):(this.previews.get(asset.path)||(this.quality==='auto'?asset.previewPath:undefined)||asset.normalizedPath||asset.path);
    const assetKey=`${asset.id}:${asset.hash}`;
    let decoder=this.decoders.get(layer.id);
    if(decoder&&(decoder.assetKey!==assetKey||!playing&&decoder.sourcePath!==source)){decoder.video.pause();decoder.video.removeAttribute('src');decoder.video.load();this.decoders.delete(layer.id);decoder=undefined;}
    if(!decoder){const video=document.createElement('video');video.crossOrigin='anonymous';video.muted=true;video.preload='auto';video.playsInline=true;
      decoder={video,assetKey,sourcePath:source,used:performance.now(),failed:false,ready:new Promise((resolve,reject)=>{video.onloadeddata=()=>resolve();video.onerror=()=>reject(new Error(`Decoder unavailable: ${asset.name}`));})};
      decoder.ready.catch(()=>{decoder!.failed=true;});video.src=this.url(source);this.decoders.set(layer.id,decoder);
    }
    decoder.used=performance.now();
    try{await abortable(decoder.ready,this.controller.signal);}catch(error){if(this.disposed||generation!==this.generation)throw new Error('Superseded seek');return this.raw(layer,asset,generation);}
    if(this.disposed||generation!==this.generation)throw new Error('Superseded seek');
    const video=decoder.video,requestedTarget=layer.sourceTimeUs/1e6,target=Math.max(0,Math.min(requestedTarget,Number.isFinite(video.duration)?Math.max(0,video.duration-.00001):requestedTarget)),now=performance.now();
    const discontinuity=decoder.target!==undefined&&Math.abs(target-decoder.target)>(now-(decoder.requestedAt??now))/1000*rate+.2;
    const drift=target-video.currentTime;
    const speed=playing?rate*Math.max(.92,Math.min(1.08,1+drift*.5)):rate;
    if(Math.abs(video.playbackRate-speed)>.005)video.playbackRate=speed;
    if(video.seeking||Math.abs(drift)>.0001&&(decoder.generation!==generation||discontinuity||Math.abs(drift)>(playing&&!video.paused?.35:.0001))){
      video.pause();await new Promise<void>((resolve,reject)=>{
        const signal=this.controller.signal;
        const finish=(error?:Error)=>{clearTimeout(timeout);video.removeEventListener('seeked',seeked);signal.removeEventListener('abort',abort);error?reject(error):resolve();};
        const seeked=()=>finish(),abort=()=>finish(new Error('Superseded seek'));
        const timeout=setTimeout(()=>finish(new Error(`Seek timed out: ${asset.name}`)),3000);
        video.addEventListener('seeked',seeked);signal.addEventListener('abort',abort,{once:true});
        try{if(!video.seeking||Math.abs(video.currentTime-target)>.0001)video.currentTime=target;}catch(error){finish(error instanceof Error?error:new Error(String(error)));}
      });
    }
    // An older seek must never pause/play a decoder now owned by the latest one.
    if(this.disposed||generation!==this.generation)throw new Error('Superseded seek');
    decoder.generation=generation;decoder.target=target;decoder.requestedAt=now;
    if(playing){if(video.paused)void video.play().catch(()=>{});}else if(!video.paused)video.pause();
    if(this.disposed||generation!==this.generation)throw new Error('Superseded seek');return video;
  }
  private async raw(layer:FrameLayer,asset:Asset,generation:number){
    const limit=previewHeight(this.quality),factor=limit===null?1:Math.min(1,(this.quality==='auto'?640:limit*16/9)/(asset.width||640),limit/(asset.height||360)),width=Math.max(1,Math.round((asset.width||640)*factor)),height=Math.max(1,Math.round((asset.height||360)*factor));
    const batch=Math.max(1,Math.min(15,Math.floor(16*1024*1024/(width*height*4))));
    const managed=isColorGraded(layer.colorGrade),fps=asset.fps||{num:30,den:1},frameIndex=(managed?Math.round:Math.floor)(layer.sourceTimeUs*fps.num/(1e6*fps.den)),chunk=Math.floor(frameIndex/batch),key=`${managed}:${asset.id}:${asset.hash}:${asset.path}:${width}:${height}:${batch}:${chunk}`;
    const frameKey=`${key}:${frameIndex%batch}`,cached=this.rgba.get(frameKey);if(cached){cached.used=performance.now();return cached.frame;}
    if(!this.pending.has(key))this.pending.set(key,(async()=>{
      const response=await fetch(`${this.backend}/composition/frames`,{method:'POST',signal:this.controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({path:asset.normalizedPath||asset.path,timeUs:Math.round(chunk*batch*1e6*fps.den/fps.num),width,height,count:batch,fpsNum:fps.num,fpsDen:fps.den,colorManaged:managed})});
      if(!response.ok)throw new Error(`RGBA decode failed: ${asset.name}`);const bytes=new Uint8Array(await response.arrayBuffer()),size=width*height*4,count=Math.floor(bytes.length/size);
      if(!count||bytes.length%size)throw new Error(`Frame not available: ${asset.name}`);
      if(this.disposed||generation!==this.generation)throw new Error('Superseded seek');
      const frames=Array.from({length:count},(_,i)=>({data:bytes.subarray(i*size,(i+1)*size),width,height}));
      for(let i=0;i<count;i++)this.rgba.set(`${key}:${i}`,{frame:frames[i],bytes:size,used:performance.now()});
      let total=[...this.rgba.values()].reduce((n,e)=>n+e.bytes,0);for(const [id,e] of [...this.rgba].sort((a,b)=>a[1].used-b[1].used)){if(total<=32*1024*1024)break;this.rgba.delete(id);total-=e.bytes;}
      return frames;
    })());
    const job=this.pending.get(key)!;
    try{const frames=await job;return frames[Math.min(frameIndex%batch,frames.length-1)];}finally{if(this.pending.get(key)===job)this.pending.delete(key);}
  }
  releaseInactive(active:Set<string>){for(const id of this.lastRaw.keys())if(!active.has(id))this.lastRaw.delete(id);for(const [id,d] of this.decoders)if(!active.has(id)){d.video.pause();if(performance.now()-d.used>5000){d.video.removeAttribute('src');d.video.load();this.decoders.delete(id);}}}
  dispose(){this.disposed=true;this.previewController.abort();clearInterval(this.leaseTimer);this.invalidate();this.controller.abort();this.leasePaths.clear();for(const d of this.decoders.values()){d.video.pause();d.video.removeAttribute('src');d.video.load();}this.decoders.clear();this.images.clear();this.imageSizes.clear();this.rgba.clear();this.lastRaw.clear();}
}
