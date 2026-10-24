const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {buildResolveXml,exportResolveTimeline}=require('./resolve-export');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'edity-resolve-'));t.after(()=>{assert.ok(root.startsWith(os.tmpdir()+path.sep));fs.rmSync(root,{recursive:true,force:true});});return root;}
function document(root){return {title:'AI & Minecraft "edit"',revision:7,videoPath:path.join(root,'merged.mp4'),composition:{canvas:{width:1920,height:1080,fps:{num:30000,den:1001}}},clips:[{id:'a',name:'Camera & A.mp4',path:path.join(root,'Camera à #A.mp4'),start:0,duration:5},{id:'b',name:'Camera B.mp4',path:path.join(root,'Camera B.mp4'),start:5,duration:5}]};}
const segment=(clipId,sourceStartUs,editStartUs,durationUs)=>({clipId,sourceStartUs,sourceEndUs:sourceStartUs+durationUs,editStartUs,editEndUs:editStartUs+durationUs,globalSourceStartUs:sourceStartUs+(clipId==='b'?5000000:0),joinInUs:8000,joinOutUs:8000});
const manifest={id:'snapshot',durationUs:2600000,segments:[segment('a',250000,0,900000),segment('a',2100000,900000,700000),segment('b',100000,1600000,1000000)]};
const info={streams:[{codec_type:'video',width:1920,height:1080,avg_frame_rate:'971401/16190'},{codec_type:'audio',channels:2,sample_rate:'48000'}],format:{duration:'5'}};
const metadata=doc=>new Map(doc.clips.map(c=>[c.path,structuredClone(info)]));
function context(){const controller=new AbortController();return {signal:controller.signal,controller,progress:()=>{},registerCancel:()=>()=>{},assertActive:()=>{if(controller.signal.aborted)throw new Error('Cancelled');}};}

test('Resolve XML references individual sources and frame-aligned refined cuts, with linked source audio',t=>{
 const root=fixture(t),doc=document(root),result=buildResolveXml(doc,manifest,root,metadata(doc));
 assert.equal(result.clipCount,3);assert.equal(result.sourceCount,2);assert.equal(result.durationUs,2602600);assert.equal(result.originalDurationUs,2600000);
 assert.equal((result.xml.match(/<asset-clip /g)||[]).length,3);assert.match(result.xml,/start="1\/4s" duration="9009\/10000s"/);assert.match(result.xml,/offset="9009\/10000s" start="21\/10s" duration="7007\/10000s"/);
 assert.match(result.xml,/offset="1001\/625s" start="1\/10s" duration="1001\/1000s"/);assert.match(result.xml,/audioRole="dialogue"/);
 assert.match(result.xml,/frameDuration="1001\/30000s"/);assert.match(result.xml,/frameDuration="1\/60s"/);
 assert.match(result.xml,/AI &amp; Minecraft &quot;edit&quot;/);assert.match(result.xml,/Camera%20%C3%A0%20%23A.mp4/);
 assert.ok(!result.xml.includes('merged.mp4'));assert.ok(!result.xml.includes('sourcePath'));
});

test('unmodified, restored and single-source cuts export independently without mutating the snapshot',t=>{
 const root=fixture(t),doc=document(root),before=JSON.stringify(doc);const restored={id:'restored',durationUs:5000000,segments:[segment('a',0,0,5000000)]};
 const result=buildResolveXml(doc,restored,root,metadata(doc));assert.equal(result.clipCount,1);assert.equal(result.timelineFrames,149);assert.ok(5000000-result.durationUs<1000000*1001/30000);assert.equal(JSON.stringify(doc),before);
 const invalid=structuredClone(manifest);invalid.segments[1].editStartUs++;assert.throws(()=>buildResolveXml(doc,invalid,root,metadata(doc)),/gap or an overlap/);
 assert.throws(()=>buildResolveXml(doc,{...manifest,segments:[]},root,metadata(doc)),/No kept video/);
});

test('manual source partitions remain real cuts in the editable Resolve export',t=>{
 const root=fixture(t),doc=document(root);doc.composition.canvas.fps={num:30,den:1};
 doc.narration={version:1,order:[{clipId:'a',startUs:0,endUs:2000000},{clipId:'a',startUs:2000000,endUs:5000000}],parked:[],cutClipboard:[]};
 const data={id:'split',durationUs:5000000,segments:[segment('a',0,0,5000000)]};
 const result=buildResolveXml(doc,data,root,metadata(doc));assert.equal(result.clipCount,2);assert.equal(result.timelineFrames,150);assert.equal(result.durationUs,5000000);
});

const attributes=tag=>Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
const seconds=value=>{const [n,d=1]=value.slice(0,-1).split('/').map(Number);return n/d;};
function assertFrameTimeline(result){
 const tags=[...result.xml.matchAll(/<asset-clip ([^>]+)>/g)].map(m=>attributes(m[1]));
 const formats=new Map([...result.xml.matchAll(/<format ([^>]+)\/>/g)].map(m=>{const a=attributes(m[1]);return [a.id,seconds(a.frameDuration)];}));
 const assets=new Map([...result.xml.matchAll(/<asset ([^>]+)\/>/g)].map(m=>{const a=attributes(m[1]);return [a.id,a];}));
 const frame=seconds(attributes(result.xml.match(/<format ([^>]+)\/>/)[1]).frameDuration);let cursor=0;
 for(const tag of tags){
  const start=seconds(tag.start),duration=seconds(tag.duration),offset=seconds(tag.offset),sourceFrame=formats.get(tag.format),asset=assets.get(tag.ref);
  assert.ok(Math.abs(offset/frame-Math.round(offset/frame))<1e-7);assert.ok(Math.abs(duration/frame-Math.round(duration/frame))<1e-7);
  assert.ok(Math.abs(start/sourceFrame-Math.round(start/sourceFrame))<1e-7);
  assert.ok(duration>=frame-1e-10);assert.ok(Math.abs(offset-cursor)<1e-9,'no gap or overlap even when an importer rounds to frames');
  assert.ok(start+duration<=seconds(asset.start)+seconds(asset.duration)+1e-9,'no offline video tail');cursor=offset+duration;
 }
 assert.ok(Math.abs(cursor-result.durationUs/1e6)<.000001);return tags;
}
test('fractional cut boundaries do not create gaps at the two reported Minecraft joins',t=>{
 const root=fixture(t),doc=document(root);doc.composition.canvas.fps={num:30,den:1};doc.clips=doc.clips.slice(0,1);doc.clips[0].duration=818.249183;
 const durations=[38121000,5835000,1732000,6128000,5660000],starts=[0,47673000,54216000,56560000,63080000];let cursor=0;
 const segments=durations.map((d,i)=>{const s=segment('a',starts[i],cursor,d);cursor+=d;return s;});
 const data=metadata(doc);data.get(doc.clips[0].path).format.duration='818.249183';data.get(doc.clips[0].path).streams[0].nb_frames='49095';
 const result=buildResolveXml(doc,{id:'reported',durationUs:cursor,segments},root,data);const tags=assertFrameTimeline(result);
 assert.equal(tags.length,5);assert.equal(tags[1].offset,'572/15s');assert.ok(Math.abs(result.durationUs-cursor)<=1000000/60);
});
test('hundreds of cuts remain contiguous without cumulative rounding drift at integer and NTSC rates',t=>{
 const root=fixture(t);
 for(const fps of [{num:24,den:1},{num:25,den:1},{num:30,den:1},{num:30000,den:1001},{num:60000,den:1001}]){
  const doc=document(root);doc.composition.canvas.fps=fps;let cursor=0;
  const segments=Array.from({length:700},(_,i)=>{const duration=203117+(i%17)*13971,s=segment(i%2?'b':'a',113000+(i%9)*20739,cursor,duration);cursor+=duration;return s;});
  const result=buildResolveXml(doc,{id:'many',durationUs:cursor,segments},root,metadata(doc));assert.equal(assertFrameTimeline(result).length,700);
  assert.ok(Math.abs(result.durationUs-cursor)<=1e6*fps.den/fps.num/2+.5);
 }
});
test('tiny and final cuts stay editable and never reference beyond the source video',t=>{
 const root=fixture(t),doc=document(root);doc.composition.canvas.fps={num:30,den:1};
 const segments=[segment('a',500000,0,500),segment('a',4999900,500,100)];
 const result=buildResolveXml(doc,{id:'tiny',durationUs:600,segments},root,metadata(doc));assert.equal(assertFrameTimeline(result).length,2);assert.equal(result.timelineFrames,2);
 const data=metadata(doc);data.get(doc.clips[0].path).streams[0].duration='4.8';
 assert.throws(()=>buildResolveXml(doc,{id:'tiny',durationUs:600,segments},root,data),/extends beyond/);
});
test('NTSC drop-frame source timecode is represented with exact whole source frames',t=>{
 const root=fixture(t),doc=document(root),data=metadata(doc);const video=data.get(doc.clips[0].path).streams[0];video.avg_frame_rate='30000/1001';video.tags={timecode:'01:00:00;00'};
 const result=buildResolveXml(doc,manifest,root,data);assertFrameTimeline(result);assert.match(result.xml,/start="8999991\/2500s"/);
});

test('source timecode origins and missing video streams are handled explicitly',t=>{
 const root=fixture(t),doc=document(root),data=metadata(doc);data.get(doc.clips[0].path).streams[0].tags={timecode:'01:00:00:00'};
 assert.match(buildResolveXml(doc,manifest,root,data).xml,/start="14401\/4s" duration="9009\/10000s"/);
 data.get(doc.clips[0].path).streams=[];assert.throws(()=>buildResolveXml(doc,manifest,root,data),/not a video/);
});

test('real media is copied into an SSD-style handoff folder and XML publishes atomically',async t=>{
 const root=fixture(t),doc=document(root);for(const clip of doc.clips)fs.copyFileSync(path.join(__dirname,'../tests/fixtures/composition/base.mp4'),clip.path);
 const short={id:'short',durationUs:1500000,segments:[segment('a',0,0,500000),segment('a',1000000,500000,500000),segment('b',200000,1000000,500000)]};
 const outputPath=path.join(root,'export','lesson.fcpxml'),result=await exportResolveTimeline({document:doc,manifest:short,outputPath,copyMedia:true},context(),root);
 assert.equal(result.clipCount,3);assert.equal(result.sourceCount,2);assert.equal(fs.readdirSync(result.mediaDirectory).length,2);
 const xml=fs.readFileSync(outputPath,'utf8');assert.match(xml,/lesson_media/);assert.ok(!xml.includes('Camera%20B.mp4'));
 const second=await exportResolveTimeline({document:doc,manifest:short,outputPath,copyMedia:true},context(),root);assert.equal(fs.readdirSync(second.mediaDirectory).length,2);assert.equal(fs.readFileSync(outputPath,'utf8'),xml);
 const linked=await exportResolveTimeline({document:doc,manifest:short,outputPath:path.join(root,'linked.fcpxml'),copyMedia:false},context(),root);assert.equal(linked.mediaDirectory,null);assert.match(fs.readFileSync(linked.outputPath,'utf8'),/Camera%20B.mp4/);
});

test('cancelled export preserves an earlier XML and leaves no partial source copy',async t=>{
 const root=fixture(t),doc=document(root);for(const clip of doc.clips)fs.copyFileSync(path.join(__dirname,'../tests/fixtures/composition/base.mp4'),clip.path);
 const outputPath=path.join(root,'lesson.fcpxml');fs.writeFileSync(outputPath,'previous timeline');const ctx=context();ctx.progress=(progress)=>{if(progress>=10)ctx.controller.abort();};
 await assert.rejects(exportResolveTimeline({document:doc,manifest:{id:'short',durationUs:500000,segments:[segment('a',0,0,500000)]},outputPath,copyMedia:true},ctx,root),/Cancelled|aborted/);
 assert.equal(fs.readFileSync(outputPath,'utf8'),'previous timeline');assert.ok(fs.readdirSync(path.join(root,'lesson_media')).every(file=>!file.endsWith('.partial')));
});
