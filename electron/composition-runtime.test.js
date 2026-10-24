const test=require('node:test');const assert=require('node:assert/strict');const runtime=require('../shared/composition-runtime.cjs');
const manifest={id:'m',inputRevision:'1',durationUs:2000000,keepSegments:[{start:0,end:1},{start:2,end:3}],segments:[{clipId:'clip',sourceStartUs:0,sourceEndUs:1000000,editStartUs:0,editEndUs:1000000,globalSourceStartUs:0,joinInUs:0,joinOutUs:8000},{clipId:'clip',sourceStartUs:2000000,sourceEndUs:3000000,editStartUs:1000000,editEndUs:2000000,globalSourceStartUs:2000000,joinInUs:8000,joinOutUs:0}]};
test('shared browser/Python validation vectors agree',()=>{const cases=require('../tests/fixtures/composition/validation.json');for(const c of cases)if(c.valid)assert.doesNotThrow(()=>runtime.validateComposition(c.document),c.name);else assert.throws(()=>runtime.validateComposition(c.document),undefined,c.name);const invalid=structuredClone(cases[0].document);invalid.elements.title.transform.opacity=NaN;assert.throws(()=>runtime.validateComposition(invalid),/Invalid/);});

test('recorded asset frame rates retain exact probe fractions independently of canvas limits',()=>{
 const doc=structuredClone(require('../tests/fixtures/composition/validation.json')[0].document);
 const asset=doc.assets.recording={id:'recording',kind:'video',path:'recording.mp4',hash:'recording',name:'recording.mp4',durationUs:1000000,width:1920,height:1080,hasAudio:true,hasAlpha:false,status:'ready',fps:{num:971401,den:16190}};
 assert.doesNotThrow(()=>runtime.validateComposition(doc));
 doc.canvas.fps={...asset.fps};assert.throws(()=>runtime.validateComposition(doc),/fps/);
 doc.canvas.fps={num:30,den:1};
 for(const fps of [{num:0,den:1},{num:60,den:0},{num:1.5,den:1},{num:Number.MAX_SAFE_INTEGER+1,den:1}]){
  asset.fps=fps;assert.throws(()=>runtime.validateComposition(doc),/fps/);
 }
});
test('half-open source/edit intervals select the next kept frame exactly at a cut',()=>{assert.equal(runtime.editToSource(manifest,1000000).sourceUs,2000000);assert.equal(runtime.sourceToEdit(manifest,1500000,'clip'),null);assert.equal(runtime.sourceToEdit(manifest,2000000,'clip'),1000000);});
test('speech anchors adapt, suppress and recover without altering their persisted source coverage',()=>{
 const anchor={kind:'speech',startWordId:'one',endWordId:'two',startOffsetUs:0,endOffsetUs:0,fallback:{clipId:'clip',startUs:500000,endUs:2500000}};
 const words=[{id:'one',clipId:'clip',start:.5,end:.8,word:'first'},{id:'two',clipId:'clip',start:2.2,end:2.5,word:'last'}];
 assert.deepEqual(runtime.resolvePlacement(anchor,manifest,words),{startUs:500000,endUs:1500000});
 const allRemoved={...manifest,durationUs:0,segments:[]};assert.deepEqual(runtime.resolvePlacement(anchor,allRemoved,words),{startUs:0,endUs:0});
 assert.deepEqual(runtime.resolvePlacement(anchor,manifest,words),{startUs:500000,endUs:1500000});assert.equal(anchor.fallback.startUs,500000);
});
test('preset evaluation is deterministic and preserves duration for all Favorites',()=>{
 const doc=runtime.emptyComposition();doc.elements.text={id:'text',kind:'text',trackId:'text',order:0,label:'title',enabled:true,createdBy:'manual',placement:{kind:'project',startOffsetUs:0,endOffsetUs:0},transform:runtime.defaultTransform(),presets:[runtime.presetInstance('Camera Shake')],text:'A',textStyle:runtime.defaultTextStyle(),sourceInUs:0,endPolicy:'hold'};
 const plan=runtime.compileComposition(doc,manifest);assert.deepEqual(runtime.evaluateFrame(plan,200000),runtime.evaluateFrame(plan,200000));assert.equal(plan.manifest.durationUs,2000000);
 for(const preset of Object.values(runtime.presetRegistry).filter(p=>p.kind==='transition'))for(const progress of [0,.25,.5,.75,1]){const a=structuredClone(runtime.evaluateFrame(plan,200000)[0]),b=structuredClone(a);runtime.transitionLayers(a,b,runtime.presetInstance(preset.id),progress);assert.ok(Number.isFinite(a.transform.x));assert.ok(a.transform.opacity>=0&&a.transform.opacity<=1);}
});

test('interval index stays half-open at safe integer extremes and scales to sparse documents',()=>{const items=[{startUs:0,endUs:1},{startUs:Number.MAX_SAFE_INTEGER-1,endUs:Number.MAX_SAFE_INTEGER},...Array.from({length:10000},(_,i)=>({startUs:i*100+20,endUs:i*100+30}))],index=new runtime.IntervalIndex(items);for(const time of [0,1,20,29,30,987620,Number.MAX_SAFE_INTEGER-1,Number.MAX_SAFE_INTEGER])assert.deepEqual(index.at(time),items.filter(i=>i.startUs<=time&&i.endUs>time));});
