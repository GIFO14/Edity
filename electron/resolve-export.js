const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {createHash,randomUUID}=require('node:crypto');
const {spawn}=require('node:child_process');
const {pipeline}=require('node:stream/promises');
const {locateTool}=require('./ffmpeg-paths');

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
function buildResolveXml(document,manifest,directory,metadata,mediaPaths=new Map()){
 const cuts=cutSources(document,manifest,directory),files=[...new Set(cuts.map(c=>c.file))];
 const canvas=document.composition?.canvas||{width:1920,height:1080,fps:{num:30,den:1}};
 const fps=nominalRate(canvas.fps),title=document.title||'Edity edit';
 const resources=[`    <format id="timeline-format" frameDuration="${rational(fps.den,fps.num)}" width="${canvas.width}" height="${canvas.height}"/>`];
 const assets=new Map();
 files.forEach((file,index)=>{
  const info=metadata.get(file);if(!info)throw new Error(`Missing metadata: ${path.basename(file)}`);
  const video=info.streams?.find(s=>s.codec_type==='video'),audio=info.streams?.find(s=>s.codec_type==='audio');
  if(!video)throw new Error(`Source is not a video: ${path.basename(file)}`);
  const sourceFps=nominalRate(rate(video.avg_frame_rate,rate(video.r_frame_rate,fps)));
  const startFrame=timecodeFrames(video.tags?.timecode||info.format?.tags?.timecode,sourceFps);
  const durationUs=Math.round(Number(video.duration||info.format?.duration)*1000000);
  if(!Number.isSafeInteger(durationUs)||durationUs<=0)throw new Error(`Invalid source duration: ${path.basename(file)}`);
  const id=`source-${index+1}`,format=`source-format-${index+1}`;
  const reportedFrames=Number(video.nb_frames),frameCount=Number.isSafeInteger(reportedFrames)&&reportedFrames>0?reportedFrames:Math.max(1,framesAt(durationUs,sourceFps));
  const asset={id,format,startFrame,frameCount,fps:sourceFps,durationUs,hasAudio:!!audio};assets.set(file,asset);
  resources.push(`    <format id="${format}" frameDuration="${rational(sourceFps.den,sourceFps.num)}" width="${video.width}" height="${video.height}"/>`);
  resources.push(`    <asset id="${id}" name="${xml(cuts.find(c=>c.file===file).clip.name||path.basename(file))}" src="${xml(pathToFileURL(mediaPaths.get(file)||file).href)}" start="${frameTime(startFrame,sourceFps)}" duration="${frameTime(frameCount,sourceFps)}" hasVideo="1" format="${format}" hasAudio="${audio?'1':'0'}"${audio?` audioSources="1" audioChannels="${audio.channels||2}" audioRate="${audio.sample_rate||48000}"`:''}/>`);
 });
 // Resolve places video on whole frames. Independent rounding of subframe
 // offsets, durations and source in-points can leave gaps and split linked
 // audio across tracks. Quantize once, then derive every offset from the end
 // of the preceding clip. Cumulative rounding avoids drift over many cuts.
 let timelineFrames=0;
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
  timelineFrames+=durationFrames;
  return `          <asset-clip ${attrs}>\n            <note>${xml(`Edity cut ${index+1} · ${clip.id}`)}</note>\n          </asset-clip>`;
 });
 const output=`<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE fcpxml>\n<fcpxml version="1.6">\n  <resources>\n${resources.join('\n')}\n  </resources>\n  <library>\n    <event name="Edity">\n      <project name="${xml(title)}">\n        <sequence format="timeline-format" duration="${frameTime(timelineFrames,fps)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">\n          <spine>\n${clips.join('\n')}\n          </spine>\n        </sequence>\n      </project>\n    </event>\n  </library>\n</fcpxml>\n`;
 return {xml:output,clipCount:cuts.length,sourceCount:files.length,durationUs:Math.round(timelineFrames*1e6*fps.den/fps.num),originalDurationUs:manifest.durationUs,timelineFrames,fps};
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
 const files=[...new Set(cutSources(document,manifest,directory).map(c=>c.file))],metadata=new Map(),mediaPaths=new Map();
 const sizes=files.map(file=>{if(!fs.statSync(file).isFile())throw new Error(`Missing source: ${path.basename(file)}`);return fs.statSync(file).size;});
 for(let i=0;i<files.length;i++){ctx.progress(2+Math.round(i/files.length*8),'Reading source clips');metadata.set(files[i],await probe(files[i],ctx));}
 // Validate the complete timeline before copying or publishing any export.
 buildResolveXml(document,manifest,directory,metadata);
 let mediaDirectory=null;
 if(payload.copyMedia!==false){
  const basename=path.basename(outputPath,'.fcpxml').slice(0,70);mediaDirectory=path.join(path.dirname(outputPath),`${basename}_media`);
  await fs.promises.mkdir(mediaDirectory,{recursive:true});const total=sizes.reduce((a,b)=>a+b,0);let finishedBytes=0,lastProgress=0;
  for(let i=0;i<files.length;i++){
   ctx.assertActive();const source=files[i],stat=fs.statSync(source),hash=createHash('sha256').update(`${source}|${stat.size}|${stat.mtimeMs}`).digest('hex').slice(0,16);
   const target=path.join(mediaDirectory,`${hash}${path.extname(source).toLowerCase()}`);
   if(!fs.existsSync(target)||fs.statSync(target).size!==stat.size)await copySource(source,target,ctx,bytes=>{if(Date.now()-lastProgress>200){lastProgress=Date.now();ctx.progress(10+Math.round((finishedBytes+bytes)/Math.max(1,total)*85),`Copying clip ${i+1} of ${files.length}`);}});
   finishedBytes+=stat.size;mediaPaths.set(source,target);
  }
 }
 ctx.assertActive();ctx.progress(97,'Writing editable timeline');
 const result=buildResolveXml(document,manifest,directory,metadata,mediaPaths),temporary=`${outputPath}.${randomUUID()}.tmp`;
 await fs.promises.mkdir(path.dirname(outputPath),{recursive:true});
 try{await fs.promises.writeFile(temporary,result.xml,{encoding:'utf8',flag:'wx'});ctx.assertActive();await fs.promises.rename(temporary,outputPath);}finally{await fs.promises.unlink(temporary).catch(()=>{});}
 return {outputPath,mediaDirectory,clipCount:result.clipCount,sourceCount:result.sourceCount,durationUs:result.durationUs,originalDurationUs:result.originalDurationUs,timelineFrames:result.timelineFrames,fps:result.fps,revision:document.revision,manifestId:manifest.id,format:'fcpxml'};
}
module.exports={buildResolveXml,exportResolveTimeline,cutSources,rational};
