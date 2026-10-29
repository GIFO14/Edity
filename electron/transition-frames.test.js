const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
function load(file){const out=require('../frontend/node_modules/esbuild').buildSync({entryPoints:[path.join(__dirname,'../frontend/src',file)],bundle:true,platform:'node',format:'cjs',write:false});const m={exports:{}};new Function('module','exports',out.outputFiles[0].text)(m,m.exports);return m.exports;}
const {upcomingTransitionFrames,isBaseTransitionLayer}=load('render/transitionFrames.ts');
const {FrameProvider}=load('render/frameProvider.ts'),runtime=require('../shared/composition-runtime.cjs');
test('a base-to-base transition prewarms two different source handles, never pauses an active transition',()=>{
 const d=runtime.emptyComposition();d.assets.v={id:'v',kind:'video',path:'fixture.mp4',hash:'fixture',name:'Fixture',durationUs:10e6,width:640,height:360,hasAudio:false,hasAlpha:false,status:'ready'};
 d.elements.base={id:'base',kind:'base',assetId:'v',trackId:'base',order:0,label:'Base',enabled:true,createdBy:'manual',placement:{kind:'project',startOffsetUs:0,endOffsetUs:0},transform:runtime.defaultTransform(),presets:[],sourceInUs:0,endPolicy:'hold'};
 d.transitions.cut={id:'cut',fromId:'base',toId:'base',atUs:2e6,durationUs:500000,alignment:'center',preset:{presetId:'Xir_Zoom_v4',presetVersion:1,params:{strength:1,blur:1}}};
 const m={id:'m',inputRevision:'m',durationUs:8e6,keepSegments:[{start:0,end:2},{start:4,end:10}],segments:[{clipId:'c',sourceStartUs:0,sourceEndUs:2e6,globalSourceStartUs:0,editStartUs:0,editEndUs:2e6,joinInUs:0,joinOutUs:0},{clipId:'c',sourceStartUs:4e6,sourceEndUs:10e6,globalSourceStartUs:4e6,editStartUs:2e6,editEndUs:8e6,joinInUs:0,joinOutUs:0}]};
 const p=runtime.compileComposition(d,m),warm=upcomingTransitionFrames(p,1e6);
 assert.deepEqual(warm.map(x=>x.layer.id),['cut:out','cut:in']);
 assert.equal(warm[1].layer.sourceTimeUs-warm[0].layer.sourceTimeUs,2e6);assert.ok(warm.every(x=>isBaseTransitionLayer(x.layer)));
 assert.deepEqual(upcomingTransitionFrames(p,1.9e6),[]);assert.deepEqual(upcomingTransitionFrames(p,0,100000),[]);
});
test('available frames exclude unpresented/seeking and older-generation video pictures',()=>{
 const p=new FrameProvider('http://fixture','original'),video={readyState:4,seeking:false};
 const layer={id:'cut:out',element:{kind:'base',id:'base'}};
 p.decoders.set(layer.id,{video,generation:0});assert.equal(p.available(layer),video);
 video.seeking=true;assert.equal(p.available(layer),null);video.seeking=false;p.generation=1;assert.equal(p.available(layer),null);
 p.decoders.clear();p.dispose();
});
test('a new generation requesting an already-pending seek waits for its presented picture',async()=>{
 const original=global.document;
 class Video extends EventTarget{
  constructor(){super();this.readyState=0;this.seeking=false;this.paused=true;this.duration=10;this.time=0;this.playbackRate=1;}
  set src(v){this.source=v;queueMicrotask(()=>{this.readyState=4;this.onloadeddata?.();});}
  get currentTime(){return this.time;}set currentTime(v){this.time=v;this.seeking=true;this.readyState=1;}
  pause(){this.paused=true;}play(){this.paused=false;return Promise.resolve();}removeAttribute(){}load(){}
  present(){this.seeking=false;this.readyState=4;this.dispatchEvent(new Event('seeked'));}
 }
 const video=new Video();global.document={createElement:()=>video};const p=new FrameProvider('http://fixture','original');
 try{
  const layer={id:'cut:in',element:{kind:'base',id:'base'},sourceTimeUs:4e6},asset={id:'v',hash:'v',path:'fixture.mp4',kind:'video',hasAlpha:false,name:'Fixture'};
  const first=p.frame(layer,asset,false,1).catch(()=>null);await new Promise(r=>setTimeout(r,0));assert.equal(video.seeking,true);
  p.invalidate();await first;
  let settled=false;const latest=p.frame(layer,asset,false,1).then(value=>{settled=true;return value;});
  await new Promise(r=>setTimeout(r,0));assert.equal(settled,false);assert.equal(p.available(layer),null);
  video.present();assert.equal(await latest,video);assert.equal(p.available(layer),video);
 }finally{p.dispose();global.document=original;}
});
