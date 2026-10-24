const test=require('node:test'),assert=require('node:assert/strict');
const {createMediaActionSession}=require('./media-action-dispatcher');
const {registerMediaOrchestrator}=require('./media-edit-orchestrator');

function fixture(service){
  let document={revision:7,words:[{id:'w',word:'hello',clipId:'c',start:10,end:11}],
    clips:[{id:'c',path:'processed.mp4',start:10,duration:2}],deletedRanges:[],
    composition:{assets:{},elements:{}},chatMessages:[],soundEvents:[
      {id:'false',source:'acoustic',start:10.2,end:10.4},
      {id:'manual',source:'acoustic',start:11.5,end:11.7,markedForRemoval:true},
      {id:'known',source:'panns',start:10.6,end:10.8}]};
  const commits=[],ctx={jobId:'job',projectId:'p',assertActive(){},progress(){},checkpoint(){},log(){},
    getDocument:()=>document,commit(t){assert.equal(t.baseRevision,document.revision);commits.push(t);document={...document,...t.documentChanges,revision:document.revision+1};return {revision:document.revision};}};
  const services={service:async(route,payload)=>{
    if(route==='/composition/fonts')return {families:[]};
    if(route==='/preview/manifest')return {};
    return service(route,payload);
  }};
  return {ctx,services,repository:{load:()=>({entries:[]})},commits,getDocument:()=>document};
}

test('review changes annotations only, offsets clip time and retains decisions',async()=>{
  const f=fixture(async(route,payload)=>{
    assert.equal(route,'/composition/review-audio-gaps');
    assert.equal(payload.words[0].start,0);
    return {events:[{id:'new',source:'acoustic',start:1.1,end:1.3},{id:'decided',source:'acoustic',start:1.5,end:1.7}]};
  });
  const original=structuredClone(f.getDocument());
  const session=await createMediaActionSession({...f,payload:{requestId:'r'},external:true});
  const observation=await session.observe();
  await session.execute({id:'review',type:'reviewAudioGaps'},observation);
  const after=f.getDocument();
  assert.deepEqual(after.soundEvents.map(e=>e.id),['known','c-new','manual']);
  assert.equal(after.soundEvents[1].start,11.1);
  for(const key of ['words','clips','deletedRanges','composition'])assert.deepEqual(after[key],original[key]);
  assert.deepEqual(Object.keys(f.commits[0].documentChanges),['soundEvents']);
  assert.equal((await session.execute({id:'review',type:'reviewAudioGaps'},observation)).duplicate,true);
  assert.equal(f.commits.length,1);
});

test('stale review cannot overwrite intervening manual edits',async()=>{
  const f=fixture(async()=>{f.ctx.commit({baseRevision:7,documentChanges:{}});return {events:[]};});
  const session=await createMediaActionSession({...f,payload:{requestId:'r'},external:true});
  await assert.rejects(session.execute({id:'review',type:'reviewAudioGaps'},await session.observe()));
  assert.equal(f.getDocument().soundEvents.length,3);
});

test('permanent model context failure stops after one attempt',async()=>{
  let attempts=0,handler;
  const f=fixture(async()=>{attempts++;throw new Error('EDITY_AI_CONTEXT_LIMIT: too large');});
  registerMediaOrchestrator({register(kind,fn){if(kind==='media-edit')handler=fn;}},f.repository,f.services);
  await assert.rejects(handler({requestId:'r',message:'cleanup'},f.ctx),/EDITY_AI_CONTEXT_LIMIT/);
  assert.equal(attempts,1);assert.equal(f.commits.length,0);
});
