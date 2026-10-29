const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {copyElement,readTimelineClipboard,registerTimelineClipboard,FORMAT}=require('./timeline-clipboard');
const runtime=require('../shared/composition-runtime.cjs');
const compiled=require('../frontend/node_modules/esbuild').buildSync({entryPoints:[path.join(__dirname,'../frontend/src/composition/timelineClipboard.ts')],bundle:true,platform:'node',format:'cjs',write:false});
const moduleObject={exports:{}};new Function('module','exports',compiled.outputFiles[0].text)(moduleObject,moduleObject.exports);
const {pastedElement,pastedText}=moduleObject.exports;
function fixture(){
 const composition=runtime.emptyComposition(),asset={id:'song',kind:'audio',path:'assets/music.wav',hash:'hash',name:'Música pròpia.wav',durationUs:12e6,width:0,height:0,hasAudio:true,hasAlpha:false,status:'ready'};
 composition.assets.song=asset;
 const element={id:'music-1',kind:'audio',assetId:'song',trackId:'music',order:1,label:'Music',enabled:true,createdBy:'manual',placement:{kind:'timeline',startUs:1e6,endUs:5e6},transform:runtime.defaultTransform(),presets:[],sourceInUs:2e6,endPolicy:'loop',contentWindow:{offsetUs:1e6,durationUs:8e6},audio:{gainDb:-24,mute:false,fadeInUs:2e6,fadeOutUs:1e6,ducking:false,bus:'music',envelopeWindow:{offsetUs:500000,durationUs:8e6}}};
 composition.elements[element.id]=element;
 const document={revision:3,composition},repository={getDocument:()=>document,directory:()=>path.join(os.tmpdir(),'edity-copy-test')};
 let buffer=Buffer.alloc(0);const clipboard={writeBuffer:(format,b)=>{assert.equal(format,FORMAT);buffer=b;},readBuffer:()=>buffer};
 return {document,repository,clipboard,element};
}
test('copy/paste preserves independent trimmed audio, fades and gain while moving to the requested time',async()=>{
 const {document,repository,clipboard,element}=fixture();
 copyElement(repository,clipboard,{projectId:'one',expectedRevision:3,elementId:element.id,spans:[{startUs:1e6,endUs:5e6}]});
 const {payload}=await readTimelineClipboard(clipboard,repository,'one');
 const first=pastedElement(payload,document.composition,6e6,20e6,{}),second=pastedElement(payload,document.composition,9e6,20e6,{});
 assert.notEqual(first.id,second.id);assert.equal(first.placement.startUs,6e6);assert.equal(first.placement.endUs,10e6);
 assert.deepEqual(first.audio,element.audio);assert.equal(first.sourceInUs,element.sourceInUs);assert.deepEqual(first.contentWindow,element.contentWindow);
 first.audio.gainDb=-6;assert.equal(element.audio.gainDb,-24);assert.equal(payload.element.audio.gainDb,-24);
 assert.equal(path.isAbsolute(payload.assets.song.path),true);
});
test('disjoint speech coverage becomes movable timeline ranges and clipping retains the original content clock',async()=>{
 const f=fixture();f.element.contentWindow=null;f.element.audio.envelopeWindow=null;
 copyElement(f.repository,f.clipboard,{projectId:'one',expectedRevision:3,elementId:f.element.id,spans:[{startUs:1e6,endUs:2e6},{startUs:3e6,endUs:5e6}]});
 const {payload}=await readTimelineClipboard(f.clipboard,f.repository,'one');
 const pasted=pastedElement(payload,f.document.composition,7e6,10e6,{});
 assert.deepEqual(pasted.placement.ranges,[{startUs:7e6,endUs:8e6},{startUs:9e6,endUs:10e6}]);
 assert.equal(pasted.contentWindow.durationUs,3e6);assert.equal(pasted.audio.envelopeWindow.durationUs,3e6);
 assert.throws(()=>pastedElement(payload,f.document.composition,10e6,10e6,{}),/before the end/);
});
test('cross-project media/font references are remapped without carrying narration word IDs',async()=>{
 const f=fixture();copyElement(f.repository,f.clipboard,{projectId:'one',expectedRevision:3,elementId:f.element.id,spans:[{startUs:1e6,endUs:5e6}]});
 const {payload}=await readTimelineClipboard(f.clipboard,f.repository,'other');
 const pasted=pastedElement(payload,runtime.emptyComposition(),0,20e6,{song:'managed-copy'},'sound');
 assert.equal(pasted.assetId,'managed-copy');assert.equal(pasted.trackId,'sound');assert.equal(pasted.audio.bus,'sound');assert.equal(pasted.placement.kind,'timeline');
 const text=pastedText('A label',runtime.emptyComposition(),2e6,10e6);assert.equal(text.text,'A label');assert.equal(text.trackId,'text');assert.equal(text.placement.startUs,2e6);
});
test('stale revisions and the locked base cannot overwrite the clipboard',()=>{
 const f=fixture();assert.throws(()=>copyElement(f.repository,f.clipboard,{projectId:'one',expectedRevision:2,elementId:f.element.id}),/changed/);
 f.document.composition.elements.base={...f.element,id:'base',kind:'base'};
 assert.throws(()=>copyElement(f.repository,f.clipboard,{projectId:'one',expectedRevision:3,elementId:'base'}),/additional/);
 assert.equal(f.clipboard.readBuffer().length,0);
});
test('file clipboard, image bytes and literal text stay distinct and use project-owned image staging',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'edity-paste-'));try{
  const clipboard={readBuffer:()=>Buffer.alloc(0)},repository={directory:()=>directory};
  const files=await readTimelineClipboard(clipboard,repository,'one',async()=>({inputs:[{path:'D:/Música/pròpia.wav'},{path:'D:/B-roll/clip.mp4'}],text:''}));assert.equal(files.kind,'files');assert.equal(files.files.length,2);
  const image=await readTimelineClipboard(clipboard,repository,'one',async()=>({inputs:[{bytes:Buffer.from([1,2,3])}],text:''}));assert.ok(fs.existsSync(image.files[0].path));assert.ok(image.files[0].path.startsWith(directory));
  assert.deepEqual(await readTimelineClipboard(clipboard,repository,'one',async()=>({inputs:[],text:'Title'})),{kind:'text',text:'Title'});
  assert.deepEqual(await readTimelineClipboard(clipboard,repository,'one',async()=>({inputs:[],text:''})),{kind:'empty'});
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('native menu routes Copy/Paste here back only to its project and checks sender authorization',()=>{
 const f=fixture(),handlers=new Map(),messages=[];let items;
 const sender={isDestroyed:()=>false,send:(...args)=>messages.push(args)};
 registerTimelineClipboard({...f,ipcMain:{handle:(k,v)=>handlers.set(k,v)},Menu:{buildFromTemplate:t=>{items=t;return{popup:()=>{}};}},BrowserWindow:{fromWebContents:()=>null},assertProjectSender:(_e,id)=>{assert.equal(id,'one');}});
 handlers.get('timeline:contextMenu')({sender},{projectId:'one',elementId:f.element.id,timeUs:7e6});
 assert.equal(items[0].enabled,true);items[1].click();assert.equal(messages[0][0],'timeline:clipboardCommand');assert.deepEqual(messages[0][1],{projectId:'one',elementId:f.element.id,timeUs:7e6,command:'paste'});
 assert.throws(()=>handlers.get('timeline:readClipboard')({sender},'other'));
});
