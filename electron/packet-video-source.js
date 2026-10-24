const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{createHash,randomUUID}=require('node:crypto');
const {selectionFor,selectedFrame}=require('./export-frame-selection');
const pending=new Map();
function execute(exe,args,options={}){return new Promise((resolve,reject)=>{if(options.isCancelled?.())return reject(Error('Cancelled'));const p=spawn(exe,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});options.onPacketChild?.(p);let output='',error='';p.stdout.on('data',b=>output+=b);p.stderr.on('data',b=>error=(error+b).slice(-6000));p.once('error',reject);p.once('close',c=>c===0?resolve(output):reject(Error(error||'Packet inspection failed')));});}
function extraData(text){return Buffer.from(text.split('\n').filter(l=>l.includes(':')).map(l=>l.slice(l.indexOf(':')+1).trim().split(/\s{2,}/)[0].replace(/\s/g,'')).join(''),'hex');}
async function packetMetadata(asset,options){
 const run=(exe,args)=>execute(exe,args,options);
 const file=asset.normalizedPath||asset.path,stat=fs.statSync(file),id=createHash('sha256').update(JSON.stringify([file,stat.size,stat.mtimeMs,4])).digest('hex');if(pending.has(id))return pending.get(id);
 const promise=(async()=>{
  const cache=path.join(require('node:os').tmpdir(),'edity-packet-cache');fs.mkdirSync(cache,{recursive:true});const saved=path.join(cache,id+'.json');if(fs.existsSync(saved))return JSON.parse(fs.readFileSync(saved,'utf8'));
  const details=JSON.parse(await run(options.ffprobe,['-v','error','-select_streams','v:0','-show_streams','-show_data','-show_entries','stream=codec_name,codec_tag_string,time_base,extradata,width,height,start_time,pix_fmt,color_space,color_primaries,color_range,field_order','-of','json',file])).streams[0];
  if(details.codec_name!=='h264'||details.codec_tag_string!=='avc1'||details.pix_fmt!=='yuv420p'||details.color_space!=='bt709'||details.color_primaries&&details.color_primaries!=='bt709'||details.color_range&&details.color_range!=='tv'||details.field_order&&details.field_order!=='progressive'||Math.abs(Number(details.start_time||0))>1e-6)return null;
  const packets=JSON.parse(await run(options.ffprobe,['-v','error','-select_streams','v:0','-show_packets','-show_entries','packet=pts,pos,size,flags,duration','-of','json',file])).packets;
  if(!packets?.length||packets.some(p=>p.pts===undefined||!p.pos||!p.size))return null;
  // Retag only the decoder's AVC configuration. Compressed source packets and
  // originals remain untouched. Managed SDR grading uses encoded sRGB values.
  const tiny=path.join(cache,`${id}-${randomUUID()}.mp4`);let description;
  try{await run(options.ffmpeg,['-v','error','-y','-i',file,'-map','0:v:0','-an','-c:v','copy','-bsf:v','h264_metadata=transfer_characteristics=13','-frames:v','1',tiny]);const tagged=JSON.parse(await run(options.ffprobe,['-v','error','-select_streams','v:0','-show_streams','-show_data','-of','json',tiny])).streams[0];description=extraData(tagged.extradata).toString('hex');}finally{if(fs.existsSync(tiny))fs.unlinkSync(tiny);}
  if(!description||description.length<10)return null;
  const metadata={details,description,packets:packets.map(p=>({pts:Number(p.pts),pos:Number(p.pos),size:Number(p.size),key:p.flags.includes('K'),duration:Number(p.duration||0)}))};
  const tmp=saved+'.'+randomUUID()+'.tmp';fs.writeFileSync(tmp,JSON.stringify(metadata));try{fs.renameSync(tmp,saved);}catch(e){if(fs.existsSync(saved))fs.unlinkSync(tmp);else throw e;}return metadata;
 })();pending.set(id,promise);return promise;
}
async function createPacketVideoSource(asset,options,{rate,managed,outputFps}){
 if(typeof VideoDecoder==='undefined')return null;const metadata=await packetMetadata(asset,options);if(!metadata)return null;
 const description=Buffer.from(metadata.description,'hex'),codec='avc1.'+description.subarray(1,4).toString('hex'),config={codec,description,width:asset.width,height:asset.height,codedWidth:asset.width,codedHeight:asset.height,hardwareAcceleration:'prefer-hardware',optimizeForLatency:true};
 if(!(await VideoDecoder.isConfigSupported(config)).supported)return null;
 const [num,den]=metadata.details.time_base.split('/').map(Number),packets=metadata.packets,display=packets.map((p,i)=>({...p,index:i,seconds:p.pts*num/den,us:Math.round(p.pts*num/den*1e6)})).sort((a,b)=>a.pts-b.pts),fd=fs.openSync(asset.normalizedPath||asset.path,'r');
 const rateRatio=managed&&asset.fps?.num?asset.fps:options.plan.document.canvas.fps;
 if(Math.abs(rateRatio.num/rateRatio.den-rate)>1e-8){fs.closeSync(fd);return null;}
 let decoder=null,error=null,closed=false,cursor=0,flushing=null,wake=null,lastLabel=-1,seek=0,seekPts=0,firstTick=0,firstDisplayIndex=0,selection=null,neededTimestamp=0;const decoded=new Map();
 const tickFor=p=>Math.round((p.pts-seekPts)*num*rateRatio.num/(den*rateRatio.den));
 const signal=()=>{wake?.();wake=null;};
 function reset(target){
  if(decoder&&decoder.state!=='closed')decoder.close();for(const f of decoded.values())f.close();decoded.clear();error=null;flushing=null;
  decoder=new VideoDecoder({output:frame=>{if(closed||frame.timestamp<neededTimestamp){frame.close();signal();return;}decoded.get(frame.timestamp)?.close();decoded.set(frame.timestamp,frame);signal();},error:e=>{error=e;signal();}});decoder.configure(config);
  cursor=0;for(let i=0;i<=target.index;i++)if(packets[i].key)cursor=i;
 }
 async function get(target){
  // Release preroll immediately: hardware decoders have a small surface pool.
  // Keeping frames from the preceding keyframe stalls before a distant seek.
  neededTimestamp=target.us;
  for(const [stamp,frame]of decoded)if(stamp<neededTimestamp){frame.close();decoded.delete(stamp);}
  const deadline=performance.now()+5000;
  while(!decoded.has(target.us)){
   if(performance.now()>deadline)throw Error(JSON.stringify({message:'GPU packet decoder target timeout',target,available:[...decoded.keys()].slice(0,8),tail:[...decoded.keys()].slice(-8),queue:decoder.decodeQueueSize,cursor}));
   if(error)throw error;if(closed)throw Error('Cancelled');
   while(cursor<packets.length&&decoder.decodeQueueSize<12){const p=packets[cursor++],bytes=Buffer.allocUnsafe(p.size);let read=0;while(read<p.size){const n=fs.readSync(fd,bytes,read,p.size-read,p.pos+read);if(!n)throw Error('Incomplete video packet');read+=n;}decoder.decode(new EncodedVideoChunk({type:p.key?'key':'delta',timestamp:Math.round(p.pts*num/den*1e6),duration:Math.max(1,Math.round(p.duration*num/den*1e6)),data:bytes}));}
   if(cursor===packets.length&&!flushing){flushing=decoder.flush().then(signal,e=>{error=e;signal();});}
   if(decoded.has(target.us))break;
   await new Promise(resolve=>{let timer;const listener=()=>{clearTimeout(timer);decoder.removeEventListener('dequeue',listener);if(wake===listener)wake=null;resolve();};wake=listener;decoder.addEventListener('dequeue',listener,{once:true});timer=setTimeout(listener,50);});
   if(flushing&&decoder.decodeQueueSize===0&&!decoded.has(target.us)){await flushing;if(!decoded.has(target.us))throw Error('GPU decoder did not return requested source frame');}
  }
  for(const [stamp,frame]of decoded)if(stamp<target.us){frame.close();decoded.delete(stamp);}return decoded.get(target.us);
 }
 return{
  async frame(label,timeUs){
   const cached=label===lastLabel;
   if(!decoder||label<lastLabel||label>lastLabel+Math.ceil(rate*2)||!cached&&selection&&label!==selectedFrame(selection)){
    seek=label/rate;seekPts=Math.round(Math.round(seek*1e6)*den/(num*1e6));firstDisplayIndex=display.findIndex(p=>p.pts>=seekPts);if(firstDisplayIndex<0)firstDisplayIndex=display.length-1;const first=display[firstDisplayIndex];firstTick=tickFor(first);this.startLabel=label;
    selection=managed&&rate>outputFps*1.1?selectionFor(label,timeUs,rate,outputFps):null;
    reset(first);
   }
   // FFmpeg's default rawvideo CFR mux duplicates the first picture to fill
   // positive initial PTS. The selected 60fps path explicitly uses passthrough.
   const tick=(selection?firstTick:0)+label-this.startLabel;let lo=0,hi=display.length;while(lo<hi){const mid=(lo+hi)>>1;if(tickFor(display[mid])<=tick)lo=mid+1;else hi=mid;}
   const target=display[Math.max(firstDisplayIndex,lo-1)];const frame=await get(target);if(!cached&&selection)selection.count++;lastLabel=label;return frame;
  },
  close(){if(closed)return;closed=true;if(decoder&&decoder.state!=='closed')decoder.close();for(const frame of decoded.values())frame.close();decoded.clear();fs.closeSync(fd);signal();}
 };
}
module.exports={createPacketVideoSource,packetMetadata};
