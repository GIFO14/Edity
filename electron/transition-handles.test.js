const test=require('node:test'),assert=require('node:assert/strict');
const r=require('../shared/composition-runtime.cjs');
function fixture(atUs=1000000){
 const doc=r.emptyComposition();
 doc.assets.video={id:'video',kind:'video',path:'video.mp4',hash:'video',name:'video',durationUs:6000000,width:1920,height:1080,hasAudio:true,hasAlpha:false,status:'ready'};
 doc.elements.base={id:'base',kind:'base',trackId:'base',order:0,label:'Base',enabled:true,createdBy:'manual',placement:{kind:'project',startOffsetUs:0,endOffsetUs:0},transform:r.defaultTransform(),presets:[],assetId:'video',sourceInUs:0,endPolicy:'hold'};
 doc.transitions.cut={id:'cut',fromId:'base',toId:'base',atUs,durationUs:533333,alignment:'center',preset:r.presetInstance('Xir_Ver_Arb_v4')};
 const manifest={id:'m',inputRevision:'1',durationUs:2000000,keepSegments:[{start:0,end:1},{start:4,end:5}],segments:[{clipId:'clip',sourceStartUs:0,sourceEndUs:1000000,globalSourceStartUs:0,editStartUs:0,editEndUs:1000000,joinInUs:0,joinOutUs:8000},{clipId:'clip',sourceStartUs:4000000,sourceEndUs:5000000,globalSourceStartUs:4000000,editStartUs:1000000,editEndUs:2000000,joinInUs:8000,joinOutUs:0}]};
 return {doc,manifest,plan:r.compileComposition(doc,manifest)};
}
test('Both transition pictures advance through source handles without changing voice edits',()=>{
 for(const rounding of [-16000,0,16000]){
  const {plan,manifest}=fixture(1000000+rounding),saved=structuredClone(manifest);
  for(const dt of [-200000,-33333,0,33333,200000]){
   const layers=r.evaluateFrame(plan,1000000+rounding+dt);
   assert.equal(layers.find(l=>l.id==='cut:out').sourceTimeUs,1000000+dt);
   assert.equal(layers.find(l=>l.id==='cut:in').sourceTimeUs,4000000+dt);
  }
  assert.deepEqual(plan.manifest,saved);
  assert.equal(r.editToSource(manifest,1000000).globalSourceUs,4000000);
 }
});
test('A transition inside a continuous clip uses its own source position',()=>{
 const {plan}=fixture(1500000);
 for(const dt of [-100000,100000])for(const layer of r.evaluateFrame(plan,1500000+dt))assert.equal(layer.sourceTimeUs,4500000+dt);
});
test('Fusion transition reaches its final position on the last inclusive frame',()=>{
 const {plan}=fixture(),t=plan.transitions[0];
 const layers=r.evaluateFrame(plan,t.startUs+15*1e6/30);
 assert.ok(Math.abs(layers[1].transition.offsetY)<1e-9);
 assert.equal(layers[1].transition.mix,1);
});
test('Animated effects continue advancing across a transition',()=>{
 const {doc,manifest}=fixture();doc.elements.base.presets=[{...r.presetInstance('fade-in'),params:{duration:2}}];
 const plan=r.compileComposition(doc,manifest);
 for(const dt of [-100000,100000])for(const layer of r.evaluateFrame(plan,1000000+dt))assert.ok(Math.abs(layer.transform.opacity-(1000000+dt)/2000000)<1e-9);
});
