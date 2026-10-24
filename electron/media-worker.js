const { parentPort, workerData } = require('node:worker_threads');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { locateTool } = require('./ffmpeg-paths');
const {decoderInputArgs}=require('./decoder-input');
const {sourceFrameRate,sourceFrameIndex}=require('./source-frame-time');
const processes = new Set();
let cancelled = false;
const pending = new Map();
parentPort.on('message', message => {
  if (message.type === 'cancel') { cancelled = true; for (const process of processes) process.kill();for(const request of pending.values())request.reject(new Error('Cancelled'));pending.clear(); }
  else { const reply = pending.get(message.sequence); if (reply) { pending.delete(message.sequence); message.error ? reply.reject(new Error(message.error)) : reply.resolve(message); } }
});
function run(args, stdio = ['ignore', 'pipe', 'pipe'], executable=workerData.ffmpeg || locateTool('ffmpeg')) {
  if (cancelled) throw new Error('Cancelled');
  const process = spawn(executable, args, { windowsHide: true, stdio });
  process.stdin?.on('error',()=>{});
  processes.add(process);parentPort.postMessage({type:'child',pid:process.pid,status:'started'});process.on('close',()=>{processes.delete(process);parentPort.postMessage({type:'child',pid:process.pid,status:'closed'});});
  let stderr = ''; process.stderr?.on('data', bytes => { stderr = (stderr + bytes).slice(-12000); });
  const done = new Promise((resolve, reject) => { process.on('error', reject); process.on('close', code => code === 0 ? resolve() : reject(new Error(cancelled ? 'Cancelled' : `FFmpeg (${code}): ${stderr}`))); });
  done.catch(() => {}); return { process, done };
}
class Decoder {
  constructor(asset, fps, managed=false) {this.managed=managed; this.asset = asset; this.fps = sourceFrameRate(asset,fps); this.time = -1; this.cached = null; this.session = null; }
  async frame(timeUs) {
    if(this.managed&&!this.managedAsset){
      const file=this.asset.normalizedPath||this.asset.path,probe=run(['-v','error','-show_streams','-of','json',file],undefined,workerData.ffprobe||locateTool('ffprobe'));let json='';for await(const chunk of probe.process.stdout)json+=chunk;await probe.done;
      const v=JSON.parse(json).streams.find(s=>s.codec_type==='video');this.managedAsset={...this.asset,path:file,normalizedPath:undefined,color:{format:v.pix_fmt,space:v.color_space,transfer:v.color_transfer,primaries:v.color_primaries,range:v.color_range}};
    }
    const frame = this.asset.kind==='image'?0:sourceFrameIndex(timeUs,this.fps); if (frame === this.time && this.cached) return this.cached;
    if (!this.session || frame < this.time || frame > this.time + Math.ceil(this.fps * 2)) {
      this.close();
      const asset = this.asset; const width = asset.width || workerData.width, height = asset.height || workerData.height;
      this.session = run(decoderInputArgs(this.managedAsset||asset,{width,height,fps:this.fps,frame,managed:this.managed}));
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
      this.cached = output; this.time++;
    }
    return this.cached;
  }
  close() { if (this.session) this.session.process.kill(); this.session = null; this.cached = null; }
}
async function renderRequest(message, transfer = []) {
  if (cancelled) throw new Error('Cancelled');
  const sequence = randomUUID();
  const response = new Promise((resolve, reject) => pending.set(sequence,{resolve,reject}));
  parentPort.postMessage({...message,sequence},transfer);
  const timeout = setTimeout(()=>{pending.get(sequence)?.reject(new Error('Render worker timed out'));pending.delete(sequence);},60000);
  try { return await response; } finally { clearTimeout(timeout); }
}
async function main() {
  const { plan, outputPath, width, height } = workerData;
  const fps = plan.document.canvas.fps.num / plan.document.canvas.fps.den;
  const frames = workerData.capture ? 1 : Math.ceil(plan.manifest.durationUs / 1e6 * fps);
  const staging = path.join(path.dirname(outputPath),`.edity-${randomUUID()}.${workerData.capture?'png':workerData.format || 'mp4'}`);
  const codecs = workerData.capture?['-c:v','png']:workerData.format === 'webm' ? ['-c:v','libvpx-vp9','-crf','24','-b:v','0'] : ['-c:v','libx264','-preset','veryfast','-crf','18'];
  const audio = workerData.audioPath ? ['-i',workerData.audioPath,'-map','0:v:0','-map','1:a:0','-c:a',workerData.format==='webm'?'libopus':'aac','-b:a','192k'] : ['-an'];
  const encoder = run(['-v','error','-y','-f','rawvideo','-pix_fmt','rgba','-s',`${width}x${height}`,'-r',`${plan.document.canvas.fps.num}/${plan.document.canvas.fps.den}`,'-i','pipe:0',...audio,...codecs,'-threads','2','-pix_fmt',workerData.capture?'rgba':'yuv420p',...(!workerData.capture?['-vf','scale=in_range=pc:out_range=tv:out_color_matrix=bt709,setparams=range=limited:color_primaries=bt709:color_trc=iec61966-2-1:colorspace=bt709','-color_primaries','bt709','-color_trc','iec61966-2-1','-colorspace','bt709','-color_range','tv']:[]),...(workerData.capture?['-frames:v','1']:['-t',String(plan.manifest.durationUs/1e6)]),...(workerData.format==='webm'||workerData.capture?[]:['-movflags','+faststart']),staging],['pipe','ignore','pipe']);
  const decoders = new Map(); const metrics = {decodeMs:0,renderMs:0,readbackMs:0,ipcMs:0,encodeWriteMs:0,maxRss:0,frames};
  try {
    await renderRequest({type:'init',plan,verifyParity:!!workerData.verifyParity});
    for(let index=0;index<frames;index++) {
      if(cancelled)throw new Error('Cancelled');
      const timeUs=workerData.capture?workerData.atUs:Math.round(index*1e6*plan.document.canvas.fps.den/plan.document.canvas.fps.num);
      const evaluated=await renderRequest({type:'evaluate',timeUs});
      if(index===0)parentPort.postMessage({type:'progress',progress:0,stage:'Decoding first frame'});
      const inputs=[];let started=performance.now();
      for(const request of evaluated.layers) {
        const asset=plan.document.assets[request.assetId];if(!asset)throw new Error(`Missing asset: ${request.assetId}`);
        if(decoders.has(request.id)&&decoders.get(request.id).managed!==!!request.colorManaged){decoders.get(request.id).close();decoders.delete(request.id);}
        if(!decoders.has(request.id))decoders.set(request.id,new Decoder(asset,fps,!!request.colorManaged));
        const decoder=decoders.get(request.id);const bytes=await decoder.frame(request.sourceTimeUs);
        const data=bytes.slice().buffer;inputs.push({id:request.id,data,width:asset.width||width,height:asset.height||height});
      }
      for(const [id,decoder] of decoders)if(!evaluated.layers.some(layer=>layer.id===id)){decoder.close();decoders.delete(id);}
      metrics.decodeMs+=performance.now()-started;started=performance.now();
      if(index===0)parentPort.postMessage({type:'progress',progress:0,stage:'Drawing first frame'});
      const result=await renderRequest({type:'frame',index,timeUs,width,height,frames:inputs},inputs.map(input=>input.data));
      if(index===0&&workerData.verifyParity&&!result.parity)throw new Error('Preview/worker compositor parity failed');
      metrics.ipcMs+=performance.now()-started;metrics.renderMs+=result.renderMs;metrics.readbackMs+=result.readbackMs;
      if(index===0)parentPort.postMessage({type:'progress',progress:0,stage:'Encoding first frame'});
      started=performance.now();if(!encoder.process.stdin.write(Buffer.from(result.data)))await new Promise((resolve,reject)=>{
        const cleanup=()=>{encoder.process.stdin.removeListener('drain',drained);encoder.process.stdin.removeListener('error',failed);};
        const drained=()=>{cleanup();resolve();},failed=error=>{cleanup();reject(error);};encoder.process.stdin.once('drain',drained);encoder.process.stdin.once('error',failed);
      });metrics.encodeWriteMs+=performance.now()-started;
      metrics.maxRss=Math.max(metrics.maxRss,process.memoryUsage().rss);
      parentPort.postMessage({type:'progress',progress:Math.min(95,Math.round((index+1)/frames*95)),stage:'Rendering composition'});
    }
    encoder.process.stdin.end();await encoder.done;
    if(cancelled)throw new Error('Cancelled');
    const probe = spawn(workerData.ffprobe || locateTool('ffprobe'),['-v','error','-show_streams','-show_format','-of','json',staging],{windowsHide:true});processes.add(probe);parentPort.postMessage({type:'child',pid:probe.pid,status:'started'});
    const probed=new Promise((resolve,reject)=>{probe.on('error',reject);probe.on('close',code=>{processes.delete(probe);parentPort.postMessage({type:'child',pid:probe.pid,status:'closed'});code===0?resolve():reject(new Error(cancelled?'Cancelled':'Export probe failed'));});});probed.catch(()=>{});
    let json='';for await(const chunk of probe.stdout)json+=chunk;await probed;if(cancelled)throw new Error('Cancelled');
    const metadata=JSON.parse(json);if(!metadata.streams?.some(s=>s.codec_type==='video')||!workerData.capture&&Math.abs(Number(metadata.format.duration)-plan.manifest.durationUs/1e6)>1/fps+.05)throw new Error('Export stream or duration validation failed');
    fs.renameSync(staging,outputPath);
    parentPort.postMessage({type:'complete',outputPath,metrics});
  }finally{for(const decoder of decoders.values())decoder.close();encoder.process.kill();await encoder.done.catch(()=>{});if(fs.existsSync(staging))fs.unlinkSync(staging);}
}
main().catch(error=>parentPort.postMessage({type:cancelled?'cancelled':'error',error:String(error)})).finally(()=>parentPort.close());
