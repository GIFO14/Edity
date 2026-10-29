const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {createHash,randomUUID}=require('node:crypto');
const {spawn}=require('node:child_process');
const {pipeline}=require('node:stream/promises');
const {locateTool}=require('./ffmpeg-paths');
const composition=require('./resolve-composition');

const xml=value=>String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
function rational(num,den=1){num=BigInt(num);den=BigInt(den);if(den<=0n)throw new Error('Invalid time denominator');let a=num<0n?-num:num,b=den;while(b){[a,b]=[b,a%b];}return num===0n?'0s':`${num/a}${den/a===1n?'':`/${den/a}`}s`;}
const time=us=>{if(!Number.isSafeInteger(us)||us<0)throw new Error('Invalid edit time');return rational(us,1000000);};
const frameTime=(frames,fps)=>rational(BigInt(frames)*BigInt(fps.den),fps.num);
function framesAt(us,fps,round='nearest'){
 time(us);const numerator=BigInt(us)*BigInt(fps.num),denominator=1000000n*BigInt(fps.den);
 return Number((numerator+(round==='nearest'?denominator/2n:0n))/denominator);
}
function rate(value,fallback={num:30,den:1}){const [num,den]=String(value||'').split('/').map(Number);return Number.isSafeInteger(num)&&num>0&&Number.isSafeInteger(den)&&den>0?{num,den}:fallback;}
function nominalRate(fps){
 const standards=[{num:24,den:1},{num:25,den:1},{num:30,den:1},{num:50,den:1},{num:60,den:1},{num:120,den:1},{num:240,den:1},{num:24000,den:1001},{num:30000,den:1001},{num:60000,den:1001}];
 const closest=standards.reduce((a,b)=>Math.abs(a.num/a.den-fps.num/fps.den)<Math.abs(b.num/b.den-fps.num/fps.den)?a:b);
 return Math.abs(closest.num/closest.den-fps.num/fps.den)<.01?closest:fps;
}
function timecodeFrames(value,fps){
 if(!value)return 0;const match=String(value).match(/^(\d{2}):(\d{2}):(\d{2})([:;])(\d{2})$/);if(!match)return 0;
 const [,hours,minutes,seconds,separator,frame]=match,nominal=Math.round(fps.num/fps.den);
 let frames=(Number(hours)*3600+Number(minutes)*60+Number(seconds))*nominal+Number(frame);
 if(separator===';'&&(nominal===30||nominal===60)){const m=Number(hours)*60+Number(minutes);frames-=(nominal===60?4:2)*(m-Math.floor(m/10));}
 return frames;
}
function cutSources(document,manifest,directory){
 if(!manifest?.segments?.length||manifest.durationUs<=0)throw new Error('No kept video to export');
 const clips=document.clips?.length?document.clips:[{id:'base',name:path.basename(document.videoPath),path:document.videoPath,start:0,duration:0}];
 const byId=new Map(clips.map(clip=>[clip.id,clip]));let cursor=0;
 const segments=manifest.segments.flatMap(segment=>{
  const points=[segment.sourceStartUs,...(document.narration?.order||[]).filter(f=>f.clipId===segment.clipId&&f.startUs>segment.sourceStartUs&&f.startUs<segment.sourceEndUs).map(f=>f.startUs),segment.sourceEndUs];
  const ordered=[...new Set(points)].sort((a,b)=>a-b);
  return ordered.slice(0,-1).map((start,i)=>({...segment,sourceStartUs:start,sourceEndUs:ordered[i+1],globalSourceStartUs:segment.globalSourceStartUs+start-segment.sourceStartUs,editStartUs:segment.editStartUs+start-segment.sourceStartUs,editEndUs:segment.editStartUs+ordered[i+1]-segment.sourceStartUs}));
 });
 const cuts=segments.map(segment=>{
  if(segment.editStartUs!==cursor||segment.editEndUs<=cursor)throw new Error('The edit manifest has a gap or an overlap');
  const clip=byId.get(segment.clipId);if(!clip)throw new Error(`Unknown source clip: ${segment.clipId}`);
  const file=path.resolve(directory,clip.path),durationUs=segment.editEndUs-segment.editStartUs;
  if(segment.sourceEndUs-segment.sourceStartUs!==durationUs)throw new Error('Source and edit durations differ');
  time(segment.sourceStartUs);time(durationUs);cursor=segment.editEndUs;
  return {clip,file,segment,durationUs};
 });
 if(cursor!==manifest.durationUs)throw new Error('Edit duration does not match its cuts');return cuts;
}
function buildResolveXml(document,manifest,directory,metadata,mediaPaths=new Map(),patches=[]){
 const plan=composition.resolvePlan(document,manifest);
 const cuts=cutSources(document,manifest,directory),files=[...new Set([...cuts.map(c=>c.file),...composition.extraSources(plan,directory,patches)])];
 const canvas=document.composition?.canvas||{width:1920,height:1080,fps:{num:30,den:1}};
 const fps=nominalRate(canvas.fps),title=document.title||'Edity edit';
 const resources=[`    <format id="timeline-format" frameDuration="${rational(fps.den,fps.num)}" width="${canvas.width}" height="${canvas.height}"/>`];
 const assets=new Map();
 files.forEach((file,index)=>{
  const info=metadata.get(file);if(!info)throw new Error(`Missing metadata: ${path.basename(file)}`);
  const video=info.streams?.find(s=>s.codec_type==='video'),audio=info.streams?.find(s=>s.codec_type==='audio');
  const original=Object.values(document.composition?.assets||{}).find(a=>path.resolve(directory,a.normalizedPath||a.path)===file),image=original?.kind==='image';
  if(!video&&!audio)throw new Error(`Source is not a video or audio resource: ${path.basename(file)}`);
  if(!video&&cuts.some(c=>c.file===file))throw new Error(`Source is not a video: ${path.basename(file)}`);
  const sourceFps=video?nominalRate(rate(video.avg_frame_rate,rate(video.r_frame_rate,fps))):fps;
  const startFrame=timecodeFrames(video?.tags?.timecode||info.format?.tags?.timecode,sourceFps);
  const durationUs=image?manifest.durationUs:Math.round(Number(video?.duration||audio?.duration||info.format?.duration)*1000000);
  if(!Number.isSafeInteger(durationUs)||durationUs<=0)throw new Error(`Invalid source duration: ${path.basename(file)}`);
  const id=`source-${index+1}`,format=`source-format-${index+1}`;
  const reportedFrames=Number(video?.nb_frames),frameCount=!image&&Number.isSafeInteger(reportedFrames)&&reportedFrames>0?reportedFrames:Math.max(1,framesAt(durationUs,sourceFps));
  const asset={id,format,startFrame,frameCount,fps:sourceFps,durationUs,hasAudio:!!audio};assets.set(file,asset);
  if(video)resources.push(`    <format id="${format}"${image?' name="FFVideoFormatRateUndefined"':` frameDuration="${rational(sourceFps.den,sourceFps.num)}"`} width="${video.width}" height="${video.height}"/>`);
  resources.push(`    <asset id="${id}" name="${xml(cuts.find(c=>c.file===file)?.clip.name||original?.name||path.basename(file))}" src="${xml(pathToFileURL(mediaPaths.get(file)||file).href)}" start="${frameTime(startFrame,sourceFps)}" duration="${image?'0s':frameTime(frameCount,sourceFps)}" hasVideo="${video?'1':'0'}"${video?` format="${format}"`:''} hasAudio="${audio?'1':'0'}"${audio?` audioSources="1" audioChannels="${audio.channels||2}" audioRate="${audio.sample_rate||48000}"`:''}/>`);
 });
 const connected=composition.connectedLayers({plan,assets,directory,patches,fps,time,frameTime,framesAt});resources.push(...connected.resources);
 // Resolve places video on whole frames. Independent rounding of subframe
 // offsets, durations and source in-points can leave gaps and split linked
 // audio across tracks. Quantize once, then derive every offset from the end
 // of the preceding clip. Cumulative rounding avoids drift over many cuts.
 let timelineFrames=0;const primary=[];
 const clips=cuts.map(({clip,file,segment},index)=>{
  const asset=assets.get(file);
  if(segment.sourceEndUs>asset.durationUs+50000)throw new Error(`A cut extends beyond ${clip.name}`);
  let sourceFrame=framesAt(segment.sourceStartUs,asset.fps,'floor');
  let durationFrames=Math.max(1,framesAt(segment.editEndUs,fps)-timelineFrames);
  const available=()=>Number(BigInt(asset.frameCount-sourceFrame)*BigInt(asset.fps.den)*BigInt(fps.num)/(BigInt(asset.fps.num)*BigInt(fps.den)));
  // A tiny final fragment still needs a real video frame. Keep it editable
  // using the last complete timeline frame rather than an offline tail.
  if(available()<1)sourceFrame=Math.max(0,asset.frameCount-Math.ceil(asset.fps.num*fps.den/(asset.fps.den*fps.num)));
  durationFrames=Math.min(durationFrames,available());
  if(durationFrames<1)throw new Error(`Source has no complete video frame: ${clip.name}`);
  const attrs=`ref="${asset.id}" name="${xml(clip.name||path.basename(file))}" offset="${frameTime(timelineFrames,fps)}" start="${frameTime(asset.startFrame+sourceFrame,asset.fps)}" duration="${frameTime(durationFrames,fps)}" format="${asset.format}"${asset.hasAudio?' audioRole="dialogue"':''}`;
  const base=plan?.elements.find(e=>e.kind==='base'),sourceUs=Math.round((asset.startFrame+sourceFrame)*1e6*asset.fps.den/asset.fps.num);
  const intrinsic=base?composition.visualXml(base,{startUs:segment.editStartUs,endUs:segment.editEndUs},sourceUs,plan.document.assets[base.assetId],plan,fps,time):'';
  const volume=plan?`<adjust-volume amount="${plan.audio.voiceMute?-96:plan.audio.voiceGainDb+plan.audio.masterGainDb}dB"/>`:'';
  primary.push({startFrame:timelineFrames,endFrame:timelineFrames+durationFrames,sourceUs});timelineFrames+=durationFrames;
  return {attrs,note:`Edity cut ${index+1} · ${clip.id}`,intrinsic,volume,children:[]};
 });
 for(const layer of connected.layers){
  const index=primary.findIndex(p=>p.startFrame<=layer.startFrame&&layer.startFrame<p.endFrame);if(index<0)throw Error('Supplemental layer starts outside the base timeline');
  const host=primary[index],offsetUs=Math.round(host.sourceUs+(layer.startFrame-host.startFrame)*1e6*fps.den/fps.num);
  clips[index].children.push(layer.build(time(offsetUs),frameTime(Math.min(timelineFrames,layer.endFrame)-layer.startFrame,fps)));
 }
 const clipXml=clips.map(c=>`          <asset-clip ${c.attrs}>\n            <note>${xml(c.note)}</note>${c.intrinsic}${c.volume}\n${c.children.join('\n')}\n          </asset-clip>`);
 const output=`<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE fcpxml>\n<fcpxml version="1.6">\n  <resources>\n${resources.join('\n')}\n  </resources>\n  <library>\n    <event name="Edity">\n      <project name="${xml(title)}">\n        <sequence format="timeline-format" duration="${frameTime(timelineFrames,fps)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">\n          <spine>\n${clipXml.join('\n')}\n          </spine>\n        </sequence>\n      </project>\n    </event>\n  </library>\n</fcpxml>\n`;
 return {xml:output,clipCount:cuts.length,sourceCount:files.length,layerCounts:connected.counts,durationUs:Math.round(timelineFrames*1e6*fps.den/fps.num),originalDurationUs:manifest.durationUs,timelineFrames,fps};
}
async function probe(file,ctx){
 ctx.assertActive();const child=spawn(locateTool('ffprobe'),['-v','error','-show_streams','-show_format','-of','json',file],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 const unregister=ctx.registerCancel(()=>child.kill());let output='',error='';
 try{await new Promise((resolve,reject)=>{child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error=(error+b).slice(-2000));child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(error||'Could not probe source video')));});ctx.assertActive();return JSON.parse(output);}finally{unregister();}
}
async function copySource(source,target,ctx,onBytes){
 const temporary=`${target}.${randomUUID()}.partial`;let copied=0;
 try{
  const input=fs.createReadStream(source),output=fs.createWriteStream(temporary,{flags:'wx'});
  const unregister=ctx.registerCancel(()=>{input.destroy(new Error('Cancelled'));output.destroy(new Error('Cancelled'));});
  try{input.on('data',chunk=>{try{ctx.assertActive();copied+=chunk.length;onBytes(copied);}catch(error){input.destroy(error);output.destroy(error);}});await pipeline(input,output,{signal:ctx.signal});ctx.assertActive();await fs.promises.rename(temporary,target);}finally{unregister();input.destroy();output.destroy();}
 }finally{await fs.promises.unlink(temporary).catch(()=>{});}
}
async function exportResolveTimeline(payload,ctx,directory){
 const {document,manifest}=payload,outputPath=path.resolve(payload.outputPath);
 if(path.extname(outputPath).toLowerCase()!=='.fcpxml')throw new Error('Choose a .fcpxml filename for the DaVinci Resolve timeline');
 const resolved=document.composition?.version===2?require('./asset-library').assetPaths(document,directory):document,plan=composition.resolvePlan(resolved,manifest),windows=composition.fidelityWindows(plan);
 const patches=[],basename=path.basename(outputPath,'.fcpxml').slice(0,70);
 let mediaDirectory=payload.copyMedia!==false||windows.length?path.join(path.dirname(outputPath),`${basename}_media`):null;
 if(mediaDirectory)await fs.promises.mkdir(mediaDirectory,{recursive:true});
 for(let i=0;i<windows.length;i++){
  ctx.assertActive();const window=windows[i],fps=nominalRate(document.composition.canvas.fps),startFrame=framesAt(window.startUs,fps,'floor'),endFrame=Math.min(Math.ceil(manifest.durationUs*fps.num/(1e6*fps.den)),Math.ceil(window.endUs*fps.num/(1e6*fps.den))),frameCount=endFrame-startFrame;
  if(frameCount<1)continue;
  const key=createHash('sha256').update(JSON.stringify(['edity-resolve-appearance-v1',document.composition,manifest.id,startFrame,frameCount])).digest('hex').slice(0,20),file=path.join(mediaDirectory,`edity-effect-${key}.mp4`);
  if(!fs.existsSync(file)){
   const render=require('./render-worker-manager').exportComposition({plan,outputPath:file,width:document.composition.canvas.width,height:document.composition.canvas.height,format:'mp4',startFrame,frameCount,gpuCodec:false,gpuParallel:0},p=>ctx.progress(2+Math.round((i+(p.progress||0)/100)/windows.length*43),'Rendering Edity effects for Resolve'));
   const unregister=ctx.registerCancel(()=>render.cancel());try{await render.result;}finally{unregister();}
  }
  patches.push({...window,path:file,label:`Edity appearance · ${window.reasons.join(', ')}`,startUs:Math.round(startFrame*1e6*fps.den/fps.num),endUs:Math.round(endFrame*1e6*fps.den/fps.num)});
 }
 const files=[...new Set([...cutSources(document,manifest,directory).map(c=>c.file),...composition.extraSources(plan,directory,patches)])],metadata=new Map(),mediaPaths=new Map();
 const sizes=files.map(file=>{if(!fs.statSync(file).isFile())throw new Error(`Missing source: ${path.basename(file)}`);return fs.statSync(file).size;});
 for(let i=0;i<files.length;i++){ctx.progress(2+Math.round(i/files.length*8),'Reading source clips');metadata.set(files[i],await probe(files[i],ctx));}
 // Validate the complete timeline before copying or publishing any export.
 buildResolveXml(document,manifest,directory,metadata,new Map(),patches);
 if(payload.copyMedia!==false){
  await fs.promises.mkdir(mediaDirectory,{recursive:true});const total=sizes.reduce((a,b)=>a+b,0);let finishedBytes=0,lastProgress=0;
  for(let i=0;i<files.length;i++){
   ctx.assertActive();const source=files[i],stat=fs.statSync(source),hash=createHash('sha256').update(`${source}|${stat.size}|${stat.mtimeMs}`).digest('hex').slice(0,16);
   if(path.dirname(source)===mediaDirectory){mediaPaths.set(source,source);finishedBytes+=stat.size;continue;}
   const isImage=Object.values(document.composition?.assets||{}).some(a=>a.kind==='image'&&path.resolve(directory,a.normalizedPath||a.path)===source);
   const target=path.join(mediaDirectory,`${hash}${isImage?'-image':''}${path.extname(source).toLowerCase()}`);
   if(!fs.existsSync(target)||fs.statSync(target).size!==stat.size)await copySource(source,target,ctx,bytes=>{if(Date.now()-lastProgress>200){lastProgress=Date.now();ctx.progress(10+Math.round((finishedBytes+bytes)/Math.max(1,total)*85),`Copying clip ${i+1} of ${files.length}`);}});
   finishedBytes+=stat.size;mediaPaths.set(source,target);
  }
 }
 ctx.assertActive();ctx.progress(97,'Writing editable timeline');
 const result=buildResolveXml(document,manifest,directory,metadata,mediaPaths,patches),temporary=`${outputPath}.${randomUUID()}.tmp`;
 await fs.promises.mkdir(path.dirname(outputPath),{recursive:true});
 try{await fs.promises.writeFile(temporary,result.xml,{encoding:'utf8',flag:'wx'});ctx.assertActive();await fs.promises.rename(temporary,outputPath);}finally{await fs.promises.unlink(temporary).catch(()=>{});}
 const handoffPath=outputPath.replace(/\.fcpxml$/i,'.edity-handoff.json');
 const portableComposition=structuredClone(resolved.composition);if(portableComposition)for(const asset of Object.values(portableComposition.assets||{})){const source=asset.normalizedPath||asset.path;if(mediaPaths.has(source)){asset.path=mediaPaths.get(source);delete asset.normalizedPath;delete asset.previewPath;delete asset.thumbnailPath;}}
 const handoff={format:'edity.resolve-handoff.v1',revision:document.revision,manifestId:manifest.id,layerCounts:result.layerCounts,renderedEffects:patches.map(p=>({...p,path:mediaPaths.get(p.path)||p.path})),composition:portableComposition,manifest,clips:document.clips,words:document.words,narration:document.narration,media:files.map(file=>({source:file,exported:mediaPaths.get(file)||file}))};
 const sidecar=`${handoffPath}.${randomUUID()}.tmp`;try{await fs.promises.writeFile(sidecar,JSON.stringify(handoff,null,2),'utf8');ctx.assertActive();await fs.promises.rename(sidecar,handoffPath);}finally{await fs.promises.unlink(sidecar).catch(()=>{});}
 const notesPath=outputPath.replace(/\.fcpxml$/i,'.handoff-notes.txt');
 await fs.promises.writeFile(notesPath,'Edity to DaVinci Resolve\n\nBase cuts, source audio, B-roll, images, music/sound clips and titles remain separate editable timeline items. Source audio does not include Studio Sound processing.\n\nExact Edity text styling, animations, transitions and unsupported visual effects are included as silent clips on the top appearance track. To revise an underlying title or picture in Resolve, disable the overlapping Edity appearance clip first. The original editable layers are underneath.\n\nThe .edity-handoff.json sidecar contains original settings, source timing, words and media mappings for external editing tools.\n','utf8');
 return {outputPath,mediaDirectory,handoffPath,layerCounts:result.layerCounts,clipCount:result.clipCount,sourceCount:result.sourceCount,durationUs:result.durationUs,originalDurationUs:result.originalDurationUs,timelineFrames:result.timelineFrames,fps:result.fps,revision:document.revision,manifestId:manifest.id,format:'fcpxml'};
}
module.exports={buildResolveXml,exportResolveTimeline,cutSources,rational};
