const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),vm=require('node:vm');
const source=require('../frontend/node_modules/esbuild').buildSync({stdin:{contents:"export * from './timelineEditing';export * from './runtime';export * from './timelineDrag';",resolveDir:path.resolve(__dirname,'../frontend/src/composition'),loader:'ts'},bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const box={module:{exports:{}},structuredClone};vm.runInNewContext(source,box);const r=box.module.exports;
const manifest={id:'m',inputRevision:'r',durationUs:12e6,keepSegments:[{start:0,end:12}],segments:[{clipId:'c',sourceStartUs:0,sourceEndUs:12e6,globalSourceStartUs:0,editStartUs:0,editEndUs:12e6,joinInUs:0,joinOutUs:0}]};
function fixture(kind='audio'){
 const doc=r.emptyComposition(),id='e';doc.assets.a={id:'a',kind:kind==='audio'?'audio':'video',path:'fixture',hash:'h',name:'fixture',durationUs:5e6,width:1920,height:1080,hasAudio:true,hasAlpha:false,status:'ready'};
 doc.elements.e={id,kind,trackId:kind==='audio'?'music':'visual',order:1,label:'fixture',assetId:'a',createdBy:'manual',enabled:true,placement:{kind:'timeline',startUs:0,endUs:12e6},sourceInUs:1e6,endPolicy:'loop',presets:[],transform:r.defaultTransform(),audio:{gainDb:-9,mute:false,fadeInUs:6e6,fadeOutUs:3e6,ducking:false,bus:'music'}};return doc;
}
const sample=(e,at)=>{const t=at-e.startUs;return {source:e.sourceInUs+(e.sourcePhaseUs+t)%(5e6-e.sourceInUs),gain:Math.min(1,(e.envelopePhaseUs+t)/e.fadeInUs)*Math.min(1,(e.activeDurationUs-e.envelopePhaseUs-t)/e.fadeOutUs)};};
test('gain gesture clamps, supports fine movement and does not round to full dB',()=>{
 assert.equal(r.dragGain(-12,10),-17);assert.equal(r.dragGain(-12,-10),-7);assert.equal(r.dragGain(-12,3,true),-12.3);assert.equal(r.dragGain(23,-99),24);assert.equal(r.dragGain(-90,99),-96);
});
test('splitting music through a fade preserves loop phase and envelope, including repeated cuts',()=>{
 const doc=fixture(),before=r.compileComposition(doc,manifest),ops=r.splitElement(doc,before.elements[0],4e6,'right'),split=r.applyOperations(doc,ops),after=r.compileComposition(split,manifest);
 for(const t of [0,1e6,3999999,4e6,5e6,9e6,11999999])assert.deepEqual(sample(after.audio.entries.find(e=>e.startUs<=t&&t<e.endUs),t),sample(before.audio.entries[0],t));
 const twice=r.applyOperations(split,r.splitElement(split,after.elements.find(e=>e.id==='right'),8e6,'third'));
 assert.equal(twice.elements.third.contentWindow.offsetUs,8e6);assert.equal(twice.elements.third.audio.envelopeWindow.offsetUs,8e6);assert.equal(doc.elements.e.placement.endUs,12e6);
});
test('split video keeps source frames and animated transforms at the same times',()=>{
 const doc=fixture('video');doc.elements.e.presets=[r.presetInstance('zoom')].filter(Boolean);
 const before=r.compileComposition(doc,manifest),after=r.compileComposition(r.applyOperations(doc,r.splitElement(doc,before.elements[0],4e6,'right')),manifest);
 for(const t of [1e6,4e6,5e6,10e6]){const a=r.evaluateFrame(before,t)[0],b=r.evaluateFrame(after,t)[0];assert.equal(a.sourceTimeUs,b.sourceTimeUs);assert.deepEqual(a.transform,b.transform);}
});
test('separated speech spans keep their gaps and source phase after split',()=>{
 const doc=fixture();doc.elements.e.placement={kind:'timeline',startUs:0,endUs:12e6,ranges:[{startUs:0,endUs:3e6},{startUs:7e6,endUs:12e6}]};
 const plan=r.compileComposition(doc,manifest),split=r.applyOperations(doc,r.splitElement(doc,plan.elements[0],8e6,'right')),after=r.compileComposition(split,manifest);
 assert.equal(after.elements.find(e=>e.id==='right').contentWindow.offsetUs,4e6);
 assert.equal(after.audio.entries.filter(e=>e.startUs<6e6&&e.endUs>4e6).length,0);
 const right=after.elements.find(e=>e.id==='right'),trim=r.dragElement(right,right.startUs,right.endUs,9e6,12e6,'start',manifest,[]);assert.equal(trim.contentWindow.offsetUs,5e6);assert.equal(trim.sourceInUs,1e6);
 assert.throws(()=>r.splitElement(doc,plan.elements[0],5e6,'bad'),/inside/);
 const left=after.elements.find(e=>e.id==='e'),again=r.applyOperations(split,r.splitElement(split,left,2e6,'early'));
 assert.equal(again.elements.e.placement.ranges,null);assert.equal(r.compileComposition(again,manifest).elements.find(e=>e.id==='e').activeDurationUs,2e6);
});
test('base split preserves narration source coverage and does not alter words',()=>{
 const doc={clips:[{id:'c',start:0,duration:12}],words:[{id:'w',clipId:'c',start:2,end:3,word:'hi'}]};
 const n=r.splitNarrationAtSource(doc,'c',6e6);assert.equal(n.order.length,2);assert.equal(n.order[0].endUs,n.order[1].startUs);assert.equal(n.order[1].endUs,12e6);assert.equal(n.order[0].memberWordIds[0],'w');assert.equal(r.splitNarrationAtSource({...doc,narration:n},'c',6e6),null);
});
