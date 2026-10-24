const test=require('node:test'),assert=require('node:assert/strict');
const runtime=require('../shared/composition-runtime.cjs'),{captureSpeechMembers}=require('./speech-membership');
const word=(id,start,end,clipId='clip')=>({id,word:id,start,end,clipId});
function manifest(keeps,removed=[]){let cursor=0;return {id:'qa',inputRevision:'qa',durationUs:keeps.reduce((n,[a,b])=>n+(b-a)*1e6,0),removedWordIds:removed,keepSegments:keeps.map(([start,end])=>({start,end})),segments:keeps.map(([a,b])=>{const start=cursor;cursor+=(b-a)*1e6;return {clipId:'clip',sourceStartUs:a*1e6,sourceEndUs:b*1e6,globalSourceStartUs:a*1e6,editStartUs:start,editEndUs:cursor,joinInUs:0,joinOutUs:0};})};}
const anchor=(members=['a','b','c'])=>({kind:'speech',startWordId:members[0],endWordId:members.at(-1),memberWordIds:members,startOffsetUs:0,endOffsetUs:0,fallbackClock:'clip-local',fallback:{clipId:'clip',startUs:90000000,endUs:100000000}});
test('deleting earlier speech shifts 90–100s visual to 80–90s, preserving member identities',()=>{
  const words=[word('earlier',30,40),word('a',90,93),word('b',93,97),word('c',97,100)],p=anchor();
  assert.deepEqual(runtime.resolvePlacement(p,manifest([[0,110]]),words),{startUs:90000000,endUs:100000000});
  assert.deepEqual(runtime.resolvePlacement(p,manifest([[0,30],[40,110]],['earlier']),words),{startUs:80000000,endUs:90000000});assert.deepEqual(p.memberWordIds,['a','b','c']);
});
test('removed endpoints drop their own offset, internal removal compresses coverage, total removal suppresses and undo restores',()=>{
  const words=[word('a',90,93),word('b',93,97),word('c',97,100)],p=anchor();p.startOffsetUs=100000;
  const startGone=runtime.resolvePlacement(p,manifest([[0,90],[93,110]],['a']),words);assert.equal(startGone.startUs,90000000);
  const interior=runtime.resolvePlacement(p,manifest([[0,93],[97,110]],['b']),words);assert.equal(interior.endUs-interior.startUs,5900000);
  assert.deepEqual(runtime.resolvePlacement(p,manifest([[0,90],[100,110]],['a','b','c']),words),{startUs:0,endUs:0});
  assert.deepEqual(runtime.resolvePlacement(p,manifest([[0,110]]),words),{startUs:90100000,endUs:100000000});assert.equal(p.startOffsetUs,100000);
});
test('missing original endpoints never fall back to unrelated words at the same time',()=>{
  const p=anchor(),kept=manifest([[0,110]]),foreign=[word('alien',90,100)];assert.deepEqual(runtime.resolvePlacement(p,kept,foreign),{startUs:0,endUs:0});
  const legacy={...p};delete legacy.memberWordIds;assert.deepEqual(runtime.resolvePlacement(legacy,kept,foreign),{startUs:0,endUs:0});
});
test('synthetically reordered/disjoint members do not cover foreign content and video phase pauses over its gap',()=>{
  const words=[word('a',1,2),word('alien',3,4),word('b',5,6)],m=manifest([[5,6],[3,4],[1,2]]),p=anchor(['a','b']);
  assert.deepEqual(runtime.resolvePlacementSpans(p,m,words),[{startUs:0,endUs:1000000},{startUs:2000000,endUs:3000000}]);
  const doc=runtime.emptyComposition();doc.assets.visual={id:'visual',kind:'video',path:'video.mp4',hash:'qa',name:'qa',width:320,height:180,durationUs:10000000,hasAudio:true,hasAlpha:false,status:'ready'};
  doc.elements.visual={id:'visual',kind:'video',assetId:'visual',trackId:'visual',order:0,label:'qa',enabled:true,createdBy:'manual',placement:p,transform:runtime.defaultTransform(),presets:[],sourceInUs:0,endPolicy:'hold',audio:{gainDb:0,mute:false,fadeInUs:0,fadeOutUs:0,ducking:false,bus:'supplemental'}};
  const plan=runtime.compileComposition(doc,m,words);assert.equal(runtime.evaluateFrame(plan,1500000).length,0);assert.equal(runtime.evaluateFrame(plan,2500000)[0].sourceTimeUs,1500000);assert.equal(plan.audio.entries[1].sourcePhaseUs,1000000);assert.equal(plan.audio.entries[1].activeDurationUs,2000000);
});
test('membership freezes before clip/transcript removal; new endpoints require an explicit valid reanchor',()=>{
  const doc=runtime.emptyComposition(),words=[word('a',1,2),word('b',2,3),word('c',3,4)];doc.elements.text={id:'text',placement:{...anchor(),memberWordIds:undefined}};
  captureSpeechMembers(doc,words);assert.deepEqual(doc.elements.text.placement.memberWordIds,['a','b','c']);
  captureSpeechMembers(doc,[words[1]]);assert.deepEqual(doc.elements.text.placement.memberWordIds,['a','b','c']);
  const changed=structuredClone(doc);changed.elements.text.placement.endWordId='unknown';assert.throws(()=>captureSpeechMembers(changed,words,doc,[{type:'update',id:'text',changes:{placement:{kind:'speech',endWordId:'unknown'}}}]),/existing speech endpoints/);
});
test('new cross-clip timeline binding uses clip-local first-clip hint and all real member IDs',()=>{
  const words=[word('a',11,12,'first'),word('b',20,21,'second')],m={...manifest([[11,12],[20,21]]),segments:[{clipId:'first',sourceStartUs:1000000,sourceEndUs:2000000,globalSourceStartUs:11000000,editStartUs:0,editEndUs:1000000},{clipId:'second',sourceStartUs:0,sourceEndUs:1000000,globalSourceStartUs:20000000,editStartUs:1000000,editEndUs:2000000}]};
  const p=runtime.speechPlacementForTimeline(0,2000000,m,words);assert.equal(p.kind,'speech');assert.deepEqual(p.memberWordIds,['a','b']);assert.deepEqual(p.fallback,{clipId:'first',startUs:1000000,endUs:2000000});assert.equal(p.fallbackClock,'clip-local');
});
