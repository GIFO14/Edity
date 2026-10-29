// Native I/O and the shared GPU compositor run in the isolated export renderer.
function createRenderPipeline(workerData,{renderRequest,onProgress=()=>{},onChild=()=>{}}){
if(workerData.gpuCodec&&!workerData.capture&&workerData.format!=='webm')return require('./gpu-render-pipeline').createGpuRenderPipeline(workerData,{renderRequest,onProgress,onChild});
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { locateTool } = require('./ffmpeg-paths');
const {decoderInputArgs}=require('./decoder-input');
const {sourceFrameRate,sourceFrameIndex,exportFrameIndex}=require('./source-frame-time');
const {selectionFor,selectedFrame,selectedDecoderArgs}=require('./export-frame-selection');
const processes = new Set();
let cancelled = false;
const {evaluateFrame,isColorGraded}=require('../shared/composition-runtime.cjs');
function run(args, stdio = ['ignore', 'pipe', 'pipe'], executable=workerData.ffmpeg || locateTool('ffmpeg')) {
  if (cancelled) throw new Error('Cancelled');
  const process = spawn(executable, args, { windowsHide: true, stdio });
  process.stdin?.on('error',()=>{});
  processes.add(process);onChild({pid:process.pid,status:'started'});process.on('close',()=>{processes.delete(process);onChild({pid:process.pid,status:'closed'});});
  let stderr = ''; process.stderr?.on('data', bytes => { stderr = (stderr + bytes).slice(-12000); });
  const done = new Promise((resolve, reject) => { process.on('error', reject); process.on('close', code => code === 0 ? resolve() : reject(new Error(cancelled ? 'Cancelled' : `FFmpeg (${code}): ${stderr}`))); });
  done.catch(() => {}); return { process, done };
}
class Decoder {
  constructor(asset, fps, managed=false) {this.outputFps=fps;this.managed=managed; this.asset = asset; this.fps = managed?sourceFrameRate(asset,fps):fps; this.time = -1; this.cached = null; this.session = null; }
  async frame(timeUs) {
    if(cancelled)throw new Error('Cancelled');
    if(this.managed&&!this.managedAsset){
      const file=this.asset.normalizedPath||this.asset.path,probe=run(['-v','error','-show_streams','-of','json',file],undefined,workerData.ffprobe||locateTool('ffprobe'));let json='';for await(const chunk of probe.process.stdout)json+=chunk;await probe.done;
      const v=JSON.parse(json).streams.find(s=>s.codec_type==='video');this.managedAsset={...this.asset,path:file,normalizedPath:undefined,color:{format:v.pix_fmt,space:v.color_space,transfer:v.color_transfer,primaries:v.color_primaries,range:v.color_range}};
    }
    if(cancelled)throw new Error('Cancelled');
    const frame = this.asset.kind==='image'?0:this.managed?sourceFrameIndex(timeUs,this.fps):exportFrameIndex(timeUs,this.fps); if (frame === this.time && this.cached) return this.cached;
    if (!this.session || frame < this.time || frame > this.time + Math.ceil(this.fps * 2)||this.selection&&frame!==selectedFrame(this.selection)) {
      this.close();
      const asset = this.asset; const width = asset.width || workerData.width, height = asset.height || workerData.height;
      this.selection=this.managed&&asset.kind!=='image'&&this.fps>this.outputFps*1.1?selectionFor(frame,timeUs,this.fps,this.outputFps):null;
      this.session = run(selectedDecoderArgs(this.managedAsset||asset,{width,height,fps:this.fps,frame,managed:this.managed},this.selection));
      this.iterator = this.session.process.stdout[Symbol.asyncIterator](); this.chunks = []; this.available = 0; this.time = frame - 1;
    }
    const size = (this.asset.width || workerData.width) * (this.asset.height || workerData.height) * 4;
    while (this.time < frame) {
      while (this.available < size) {
        const chunk = await this.iterator.next();
        if (chunk.done) { await this.session.done; if (this.cached) return this.cached; throw new Error(`No decoded frame: ${this.asset.name}`); }
        this.chunks.push(chunk.value); this.available += chunk.value.length;
      }
      const output = new Uint8Array(size); let offset = 0;
      while (offset < size) { const chunk = this.chunks[0], count = Math.min(chunk.length,size-offset); output.set(chunk.subarray(0,count),offset); offset+=count; this.available-=count; if(count===chunk.length)this.chunks.shift();else this.chunks[0]=chunk.subarray(count); }
      this.cached = output;if(this.selection){this.time=selectedFrame(this.selection);this.selection.count++;}else this.time++;
    }
    return this.cached;
  }
  close() { if (this.session) this.session.process.kill(); this.session = null; this.cached = null; }
}
async function main() {
  const { plan, outputPath, width, height } = workerData;
  const fps = plan.document.canvas.fps.num / plan.document.canvas.fps.den;
  const startFrame=workerData.startFrame||0;
  const frames = workerData.capture ? 1 : workerData.frameCount||Math.ceil(plan.manifest.durationUs / 1e6 * fps);
  const output=require('./export-storage').outputStage(workerData),staging=output.file;
  const codecs = workerData.capture?['-c:v','png']:workerData.format === 'webm' ? ['-c:v','libvpx-vp9','-crf','24','-b:v','0'] : ['-c:v','libx264','-preset','veryfast','-crf',String(workerData.referenceCrf??18)];
  const audio = workerData.audioPath ? ['-i',workerData.audioPath,'-map','0:v:0','-map','1:a:0','-c:a',workerData.format==='webm'?'libopus':'aac','-b:a','192k'] : ['-an'];
  const encoder = run(['-v','error','-y','-f','rawvideo','-pix_fmt','rgba','-s',`${width}x${height}`,'-r',`${plan.document.canvas.fps.num}/${plan.document.canvas.fps.den}`,'-i','pipe:0',...audio,...codecs,'-threads','2','-pix_fmt',workerData.capture?'rgba':'yuv420p',...(!workerData.capture?['-vf','scale=in_range=pc:out_range=tv:out_color_matrix=bt709,setparams=range=limited:color_primaries=bt709:color_trc=iec61966-2-1:colorspace=bt709','-color_primaries','bt709','-color_trc','iec61966-2-1','-colorspace','bt709','-color_range','tv']:[]),...(workerData.capture?['-frames:v','1']:['-t',String(frames/fps)]),...(workerData.format==='webm'||workerData.capture?[]:['-movflags','+faststart']),staging],['pipe','ignore','pipe']);
  const decoders = new Map(); const metrics = {decodeMs:0,renderMs:0,readbackMs:0,ipcMs:0,encodeWriteMs:0,maxRss:0,frames};
  try {
    await renderRequest({type:'init',plan,verifyParity:!!workerData.verifyParity,synchronousReadback:!!workerData.synchronousReadback});let lastProgress=-1;
    const prepareFrame=async index=>{
      if(cancelled)throw new Error('Cancelled');
      const timeUs=workerData.capture?workerData.atUs:Math.round((index+startFrame)*1e6*plan.document.canvas.fps.den/plan.document.canvas.fps.num);
      const layers=evaluateFrame(plan,timeUs).filter(l=>l.element.kind!=='text').map(l=>({id:l.id,assetId:l.element.assetId,sourceTimeUs:l.sourceTimeUs,colorManaged:isColorGraded(l.colorGrade)}));
      const started=performance.now(),shared=new Map();
      const inputs=await Promise.all(layers.map(async request=>{
        const asset=plan.document.assets[request.assetId];if(!asset)throw new Error(`Missing asset: ${request.assetId}`);
        const rate=request.colorManaged?sourceFrameRate(asset,fps):fps;
        const sample=asset.kind==='image'?0:request.colorManaged?sourceFrameIndex(request.sourceTimeUs,rate):exportFrameIndex(request.sourceTimeUs,rate);
        const key=`${asset.id}:${request.colorManaged}:${sample}`;
        if(!shared.has(key))shared.set(key,(async()=>{
          if(decoders.has(request.id)&&decoders.get(request.id).managed!==!!request.colorManaged){decoders.get(request.id).close();decoders.delete(request.id);}
          if(!decoders.has(request.id))decoders.set(request.id,new Decoder(asset,fps,!!request.colorManaged));
          return decoders.get(request.id).frame(request.sourceTimeUs);
        })());
        return{id:request.id,data:await shared.get(key),width:asset.width||width,height:asset.height||height};
      }));
      for(const [id,decoder]of decoders)if(!layers.some(l=>l.id===id)){decoder.close();decoders.delete(id);}
      metrics.decodeMs+=performance.now()-started;return{timeUs,inputs};
    };
    let next=prepareFrame(0);void next.catch(()=>{});
    for(let index=0;index<frames;index++) {
      if(cancelled)throw new Error('Cancelled');
      const {timeUs,inputs}=await next;
      if(index+1<frames){next=prepareFrame(index+1);void next.catch(()=>{});}
      let started=performance.now();
      if(index===0)onProgress({progress:0,stage:'Drawing first frame'});
      const result=await renderRequest({type:'frame',index,timeUs,width,height,frames:inputs});
      if(index===0&&workerData.verifyParity&&!result.parity)throw new Error('Preview/worker compositor parity failed');
      metrics.ipcMs+=performance.now()-started;metrics.renderMs+=result.renderMs;metrics.readbackMs+=result.readbackMs;
      if(index===0)onProgress({progress:0,stage:'Encoding first frame'});
      started=performance.now();if(!encoder.process.stdin.write(Buffer.from(result.data.buffer,result.data.byteOffset,result.data.byteLength)))await new Promise((resolve,reject)=>{
        const cleanup=()=>{encoder.process.stdin.removeListener('drain',drained);encoder.process.stdin.removeListener('error',failed);};
        const drained=()=>{cleanup();resolve();},failed=error=>{cleanup();reject(error);};encoder.process.stdin.once('drain',drained);encoder.process.stdin.once('error',failed);
      });metrics.encodeWriteMs+=performance.now()-started;
      metrics.maxRss=Math.max(metrics.maxRss,process.memoryUsage().rss);
      const progress=Math.min(95,Math.round((index+1)/frames*95));if(progress!==lastProgress){lastProgress=progress;onProgress({progress,stage:'Rendering composition'});}
    }
    encoder.process.stdin.end();await encoder.done;
    if(cancelled)throw new Error('Cancelled');
    const probe = spawn(workerData.ffprobe || locateTool('ffprobe'),['-v','error','-show_streams','-show_format','-of','json',staging],{windowsHide:true});processes.add(probe);onChild({pid:probe.pid,status:'started'});
    const probed=new Promise((resolve,reject)=>{probe.on('error',reject);probe.on('close',code=>{processes.delete(probe);onChild({pid:probe.pid,status:'closed'});code===0?resolve():reject(new Error(cancelled?'Cancelled':'Export probe failed'));});});probed.catch(()=>{});
    let json='';for await(const chunk of probe.stdout)json+=chunk;await probed;if(cancelled)throw new Error('Cancelled');
    const metadata=JSON.parse(json);if(!metadata.streams?.some(s=>s.codec_type==='video')||!workerData.capture&&Math.abs(Number(metadata.format.duration)-(workerData.frameCount?frames/fps:plan.manifest.durationUs/1e6))>1/fps+.05)throw new Error('Export stream or duration validation failed');
    if(!workerData.capture)await require('./export-output-validation').validateExport({file:staging,ffprobe:workerData.ffprobe||locateTool('ffprobe'),width,height,frames,fps,hasAudio:!!workerData.audioPath,duration:workerData.frameCount?frames/fps:plan.manifest.durationUs/1e6});
    await output.publish(()=>cancelled);
    return {type:'complete',outputPath,metrics};
  }catch(error){throw await require('./export-storage').encoderFailure(error,encoder.done);}
  finally{for(const decoder of decoders.values())decoder.close();encoder.process.kill();await encoder.done.catch(()=>{});output.cleanup();}
}
return {result:main().catch(error=>{cancelled=true;for(const child of processes)child.kill();throw error;}),cancel(){cancelled=true;for(const child of processes)child.kill();}};
}
module.exports={createRenderPipeline};
