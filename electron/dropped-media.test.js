const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const source=require('../frontend/node_modules/esbuild').buildSync({entryPoints:[path.join(__dirname,'../frontend/src/composition/droppedMedia.ts')],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const sandbox={module:{exports:{}},crypto:require('node:crypto').webcrypto};vm.runInNewContext(source,sandbox);
const {droppedMediaKind,dropTime,droppedElement}=sandbox.module.exports;
const {emptyComposition}=require('../shared/composition-runtime.cjs');
const asset={id:'a',kind:'audio',name:'Música pròpia.WAV',status:'ready',durationUs:2000000};
test('file kinds share the actual importer allowlist, including uppercase and extra audio formats',()=>{
 for(const [kind,exts] of Object.entries(require('../shared/media-files.json')))for(const ext of exts)assert.equal(droppedMediaKind('C:/media/file'+ext.toUpperCase()),kind==='font'?null:kind);
 assert.equal(droppedMediaKind('instructions.md'),null);
});
test('drop coordinates include scroll and zoom, clamp to edited bounds',()=>{
 assert.equal(dropTime(300,100,500,1000,10000000),7000000);
 assert.equal(dropTime(-100,100,0,1000,10000000),0);
 assert.equal(dropTime(5000,100,0,1000,10000000),9999999);
});
test('music is an editable independent non-looping audio layer with safe gain/fades and steady level',()=>{
 const d=emptyComposition(),e=droppedElement(asset,1000000,10000000,d,'base');
 assert.equal(e.trackId,'music');assert.equal(e.audio.bus,'music');assert.equal(e.audio.mute,false);assert.equal(e.audio.ducking,false);
 assert.equal(e.placement.startUs,1000000);assert.equal(e.placement.endUs,3000000);assert.equal(e.sourceInUs,0);assert.equal(e.endPolicy,'trim');assert.deepEqual(Object.keys(d.elements),[]);
 const effect=droppedElement(asset,9900000,10000000,d,'sound');assert.equal(effect.audio.bus,'sound');assert.equal(effect.audio.ducking,false);assert.equal(effect.placement.endUs,10000000);assert.ok(effect.audio.fadeOutUs<=50000);
});
test('video/image drop cannot alter the base track; lengths use media duration or five seconds',()=>{
 const d=emptyComposition(),video=droppedElement({...asset,kind:'video'},3e6,10e6,d,'base'),image=droppedElement({...asset,kind:'image'},8e6,10e6,d,'text');
 assert.equal(video.trackId,'visual');assert.equal(video.audio.mute,true);assert.equal(video.placement.endUs,5e6);assert.equal(image.placement.endUs,10e6);assert.equal(image.audio,undefined);
 assert.throws(()=>droppedElement({...asset,status:'failed'},0,10e6,d));
});
