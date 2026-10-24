// Native decoding/encoding around the delivered compositor and FFmpeg FPS grid.
// Unsupported sources keep the managed RGBA decoder; unsupported encoders retry
// the compatible renderer before publishing any output.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{randomUUID}=require('node:crypto');
const {sourceFrameRate,sourceFrameIndex}=require('./source-frame-time');
const {selectionFor,selectedFrame,selectedDecoderArgs}=require('./export-frame-selection');
const {evaluateFrame,isColorGraded}=require('../shared/composition-runtime.cjs');
function createGpuRenderPipeline(options,{renderRequest,onProgress=()=>{},onChild=()=>{}}){
 let cancelled=false;const children=new Set(),{plan,width,height,outputPath}=options,fps=plan.document.canvas.fps.num/plan.document.canvas.fps.den;
 const startFrame=options.startFrame||0,frames=options.frameCount||Math.ceil(plan.manifest.durationUs/1e6*fps),staging=path.join(path.dirname(outputPath),`.edity-${randomUUID()}.${options.format||'mp4'}`);
 const metrics={frames,decodeMs:0,renderMs:0,readbackMs:0,encodeWriteMs:0,maxRss:0,hardwareEncoder:'webcodecs-avc-qp0',nativeYuvFrames:0,rgbaFrames:0};
 function run(args,stdio=['ignore','pipe','pipe'],exe=options.ffmpeg){
  if(cancelled)throw Error('Cancelled');const child=spawn(exe,args,{windowsHide:true,stdio});children.add(child);onChild({pid:child.pid,status:'started'});child.stdin?.on('error',()=>{});let error='';child.stderr?.on('data',b=>error=(error+b).slice(-12000));
  const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>{children.delete(child);onChild({pid:child.pid,status:'closed'});code===0?resolve():reject(Error(cancelled?'Cancelled':error));});});void done.catch(()=>{});return{child,done};
 }
 const probeCache=new Map();
 class Decoder{
  constructor(asset,managed){this.asset=asset;this.managed=managed;this.fps=managed?sourceFrameRate(asset,fps):fps;this.time=-1;}
  async initialize(){
   const file=this.asset.normalizedPath||this.asset.path;
   if(!probeCache.has(file))probeCache.set(file,(async()=>{const proc=run(['-v','error','-show_streams','-of','json',file],undefined,options.ffprobe);let text='';for await(const b of proc.child.stdout)text+=b;await proc.done;return JSON.parse(text).streams.find(s=>s.codec_type==='video');})());
   const v=await probeCache.get(file);this.actual={...this.asset,path:file,normalizedPath:undefined,color:{format:v.pix_fmt,space:v.color_space,transfer:v.color_transfer,primaries:v.color_primaries,range:v.color_range}};

  }
  async frame(timeUs){
   if(!this.actual)await this.initialize();if(cancelled)throw Error('Cancelled');
   const frame=this.asset.kind==='image'?0:this.managed?sourceFrameIndex(timeUs,this.fps):Math.floor(timeUs/1e6*this.fps);
   if(options.gpuPacketDecode&&this.asset.kind==='video'&&this.packetDecoder===undefined)this.packetDecoder=await require('./packet-video-source').createPacketVideoSource(this.asset,{...options,isCancelled:()=>cancelled,onPacketChild:child=>{children.add(child);onChild({pid:child.pid,status:'started'});child.once('close',()=>{children.delete(child);onChild({pid:child.pid,status:'closed'});});}},{rate:this.fps,managed:this.managed,outputFps:fps});
   if(this.packetDecoder)return this.packetDecoder.frame(frame,timeUs);
   if(frame===this.time&&this.cached)return this.cached;
   if(!this.proc||frame<this.time||frame>this.time+Math.ceil(this.fps*2)||this.selection&&frame!==selectedFrame(this.selection)){
    this.close();this.selection=this.managed&&this.asset.kind!=='image'&&this.fps>fps*1.1?selectionFor(frame,timeUs,this.fps,fps):null;
    const args=selectedDecoderArgs(this.actual,{width:this.asset.width,height:this.asset.height,fps:this.fps,frame,managed:this.managed},this.selection);
    args.splice(2,0,'-filter_threads','1');
    this.proc=run(args);this.iterator=this.proc.child.stdout[Symbol.asyncIterator]();this.chunks=[];this.available=0;this.time=frame-1;
   }
   const size=this.asset.width*this.asset.height*4;
   while(this.time<frame){while(this.available<size){const c=await this.iterator.next();if(c.done){await this.proc.done;if(this.cached)return this.cached;throw Error('No decoded frame: '+this.asset.name);}this.chunks.push(c.value);this.available+=c.value.length;}
    const data=new Uint8Array(size);let offset=0;while(offset<size){const c=this.chunks[0],n=Math.min(c.length,size-offset);data.set(c.subarray(0,n),offset);offset+=n;this.available-=n;if(n===c.length)this.chunks.shift();else this.chunks[0]=c.subarray(n);}this.cached=data;if(this.selection){this.time=selectedFrame(this.selection);this.selection.count++;}else this.time++;
   }return this.cached;
  }
  close(){this.proc?.child.kill();this.proc=null;this.cached=null;if(this.packetDecoder){this.packetDecoder.close();this.packetDecoder=null;}}
 }
 let encoder,writing=Promise.resolve(),writeError=null;
 const write=bytes=>{writing=writing.then(async()=>{if(cancelled)throw Error('Cancelled');const started=performance.now();if(!encoder.child.stdin.write(bytes))await new Promise((resolve,reject)=>{const done=()=>{cleanup();resolve();},fail=e=>{cleanup();reject(e);},cleanup=()=>{encoder.child.stdin.off('drain',done);encoder.child.stdin.off('error',fail);};encoder.child.stdin.once('drain',done);encoder.child.stdin.once('error',fail);});metrics.encodeWriteMs+=performance.now()-started;}).catch(e=>{writeError=e;});};
 const decoders=new Map();
 const result=(async()=>{
  const audio=options.audioPath?['-i',options.audioPath,'-map','0:v:0','-map','1:a:0','-c:a','aac','-b:a','192k']:['-an'];
  encoder=run(['-v','error','-y','-r',String(fps),'-f','h264','-i','pipe:0',...audio,'-c:v','copy','-bsf:v','h264_metadata=colour_primaries=1:transfer_characteristics=13:matrix_coefficients=1:video_full_range_flag=0','-color_primaries','bt709','-color_trc','iec61966-2-1','-colorspace','bt709','-color_range','tv','-t',String(frames/fps),'-movflags','+faststart',staging],['pipe','ignore','pipe']);
  
  let last=-1;
  try{
   await renderRequest({type:'init',plan,nativeEncode:{width,height,fps,onChunk:chunk=>write(Buffer.from(chunk))}});
   for(let index=0;index<frames;index++){
    if(cancelled||writeError)throw writeError||Error('Cancelled');const timeUs=Math.round((index+startFrame)*1e6/fps),layers=evaluateFrame(plan,timeUs).filter(l=>l.element.kind!=='text');const started=performance.now(),shared=new Map();
    const inputs=await Promise.all(layers.map(async layer=>{
     const asset=plan.document.assets[layer.element.assetId],managed=isColorGraded(layer.colorGrade),rate=managed?sourceFrameRate(asset,fps):fps,sample=asset.kind==='image'?0:managed?sourceFrameIndex(layer.sourceTimeUs,rate):Math.floor(layer.sourceTimeUs/1e6*rate),key=asset.id+':'+managed+':'+sample;
     if(!shared.has(key))shared.set(key,(async()=>{let decoder=decoders.get(layer.id);if(decoder&&decoder.managed!==managed){decoder.close();decoders.delete(layer.id);decoder=null;}if(!decoder){decoder=new Decoder(asset,managed);decoders.set(layer.id,decoder);}const decoded=await decoder.frame(layer.sourceTimeUs);return{sourceKey:layer.id,data:decoder.packetDecoder?undefined:decoded,nativeFrame:decoder.packetDecoder?decoded:undefined,width:asset.width,height:asset.height};})());
     return{id:layer.id,...await shared.get(key)};
    }));
    for(const [id,decoder]of decoders)if(!layers.some(l=>l.id===id)){decoder.close();decoders.delete(id);}metrics.decodeMs+=performance.now()-started;
    const startedRender=performance.now();await renderRequest({type:'frame',index,timeUs,outputTimeUs:Math.round(index*1e6/fps),width,height,frames:inputs});metrics.renderMs+=performance.now()-startedRender;metrics.rgbaFrames+=inputs.length;await writing;if(writeError)throw writeError;metrics.maxRss=Math.max(metrics.maxRss,process.memoryUsage().rss);
    const progress=Math.min(95,Math.round((index+1)/frames*95));if(progress!==last){last=progress;onProgress({progress,stage:'Rendering on GPU'});}
   }
   await renderRequest({type:'finish'});await writing;if(writeError)throw writeError;encoder.child.stdin.end();await encoder.done;if(cancelled)throw Error('Cancelled');
   await require('./export-output-validation').validateExport({file:staging,ffprobe:options.ffprobe,width,height,frames,fps,hasAudio:!!options.audioPath,duration:frames/fps},p=>{children.add(p);onChild({pid:p.pid,status:'started'});p.once('close',()=>{children.delete(p);onChild({pid:p.pid,status:'closed'});});});
   if(cancelled)throw Error('Cancelled');fs.renameSync(staging,outputPath);return{type:'complete',outputPath,metrics};
  }finally{await renderRequest({type:'close'}).catch(()=>{});for(const d of decoders.values())d.close();encoder.child.kill();await encoder.done.catch(()=>{});if(fs.existsSync(staging))fs.unlinkSync(staging);}
 })().catch(error=>{cancelled=true;for(const child of children)child.kill();throw error;});
 return{result,cancel(){cancelled=true;for(const child of children)child.kill();}};
}
module.exports={createGpuRenderPipeline};
