const test=require('node:test'),assert=require('node:assert/strict');
const runtime=require('../shared/composition-runtime.cjs');
const words=[{id:'a',clipId:'c',word:'more',start:0,end:.5},{id:'b',clipId:'c',word:'trustworthy',start:.5,end:1},{id:'removed',clipId:'c',word:'so',start:1,end:2},{id:'next',clipId:'c',word:'next',start:2,end:3}];
const anchor={kind:'speech',startWordId:'a',endWordId:'b',memberWordIds:['a','b'],startOffsetUs:0,endOffsetUs:0,fallback:{clipId:'c',startUs:0,endUs:1000000}};
const manifest={id:'test',inputRevision:'test',durationUs:2300000,keepSegments:[{start:0,end:1.3},{start:2,end:3}],removedWordIds:['removed'],wordTimings:{b:{startUs:600000,endUs:1150000,score:.8,method:'local-forced-alignment'}},segments:[{clipId:'c',sourceStartUs:0,sourceEndUs:1300000,globalSourceStartUs:0,editStartUs:0,editEndUs:1300000,joinInUs:0,joinOutUs:8000},{clipId:'c',sourceStartUs:2000000,sourceEndUs:3000000,globalSourceStartUs:2000000,editStartUs:1300000,editEndUs:2300000,joinInUs:8000,joinOutUs:0}]};
test('acoustic visual endpoint follows actual speech; explicit legacy offsets retain their basis',()=>{
 assert.equal(runtime.resolvePlacement(anchor,manifest,words).endUs,1150000);
 assert.equal(runtime.resolvePlacement({...anchor,endOffsetUs:300000},manifest,words).endUs,1300000);
 assert.equal(runtime.resolvePlacement({...anchor,timingBasis:'acoustic',endOffsetUs:50000},manifest,words).endUs,1200000);
 assert.equal(runtime.resolvePlacement({...anchor,timingBasis:'transcript'},manifest,words).endUs,1000000);
 assert.equal(runtime.resolvePlacement(anchor,{...manifest,wordTimings:{}},words).endUs,1000000);
});
test('optional nearby-cut extension removes the flash, coalescing baked and retake joins',()=>{
 assert.equal(runtime.resolvePlacement({...anchor,endAtCutUs:300000},manifest,words).endUs,1300000);
 assert.equal(runtime.resolvePlacement({...anchor,endAtCutUs:100000},manifest,words).endUs,1150000);
 assert.equal(runtime.resolvePlacement({...anchor,endAtCutUs:300000},{...manifest,visualCutPointsUs:[1280000]},words).endUs,1300000);
});
test('extension never crosses unrelated retained speech or resurrects a deleted endpoint',()=>{
 assert.equal(runtime.resolvePlacement({...anchor,endAtCutUs:300000},{...manifest,removedWordIds:[]},words).endUs,1150000);
 const deleted={...manifest,removedWordIds:['removed','b']};
 assert.equal(runtime.resolvePlacement({...anchor,endAtCutUs:1000000},deleted,words).endUs,500000);
 assert.equal(runtime.resolvePlacement({...anchor,endAtCutUs:1000000},{...deleted,removedWordIds:['a','b','removed']},words).endUs,0);
});
test('shared endpoint requests adapt to surviving membership and include baked silence boundaries',()=>{
 const document={words,deletedRanges:[{wordIndices:[1,2]}],composition:{elements:{b:{enabled:true,placement:anchor}}},clips:[{start:10,sourceMap:{kind:'silence-processed',segments:[{processedStartUs:0,originalStartUs:0,originalEndUs:1000000},{processedStartUs:1000000,originalStartUs:3000000,originalEndUs:4000000}]}}]};
 assert.deepEqual(runtime.visualTimingRequest(document),{visual_word_ids:['a'],visual_cut_points:[11000000]});
});
test('shared preview/export compiler uses identical effective end and preserves resource exhaustion rules',()=>{
 const doc=runtime.emptyComposition();doc.assets.v={id:'v',path:'v.mp4',hash:'v',name:'v',kind:'video',durationUs:10000000,width:320,height:180,hasAudio:false,hasAlpha:false,status:'ready'};
 doc.elements.v={id:'v',kind:'video',trackId:doc.tracks.find(t=>t.kind==='visual').id,order:1,label:'broll',enabled:true,createdBy:'ai',assetId:'v',placement:{...anchor,timingBasis:'acoustic',endAtCutUs:300000},sourceInUs:0,endPolicy:'trim',transform:runtime.defaultTransform(),presets:[]};
 const plan=runtime.compileComposition(doc,manifest,words);
 assert.equal(plan.elements.find(e=>e.id==='v').endUs,1300000);
 assert.ok(runtime.evaluateFrame(plan,1299999).some(l=>l.id==='v'));
 assert.ok(!runtime.evaluateFrame(plan,1300000).some(l=>l.id==='v'));
 doc.assets.v.durationUs=1200000;const exhausted=runtime.compileComposition(doc,manifest,words);
 assert.ok(!runtime.evaluateFrame(exhausted,1250000).some(l=>l.id==='v'));
});
