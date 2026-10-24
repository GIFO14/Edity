const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {registerMediaOrchestrator}=require('./media-edit-orchestrator');
test('resource images remain labeled and visible across turns, including failed import and its repair',async()=>{
  let handler,turn=0,checkpoint;
  const repository={load:()=>({entries:[]}),directory:()=>path.resolve('fixture')};
  const document={revision:0,words:[],deletedRanges:[],chatMessages:[],mediaFolders:{broll:'fixture'},composition:{assets:{},elements:{}}};
  const services={service:async(route,payload)=>{
    if(route==='/composition/fonts')return {families:[]};
    if(route==='/preview/manifest')return {};
    if(route==='/composition/search-local')return {candidates:[{id:'wrong',kind:'video',name:'wrong.mp4',path:'wrong.mp4'},{id:'right',kind:'video',name:'right.mp4',path:'right.mp4'}]};
    if(route==='/composition/inspect-resource')return {kind:'video',timeUs:2000000,durationUs:8000000,images:[{path:payload.path+'.png',timeUs:2000000}]};
    assert.equal(route,'/composition/ai-turn');
    const actions=[{id:'s',type:'searchLocal',kind:'video'},
      {id:'bad-import',type:'import',candidateId:'candidate-s-wrong'},
      {id:'v1',type:'inspectResource',candidateId:'candidate-s-wrong'},
      {id:'v2',type:'inspectResource',candidateId:'candidate-s-right',note:'The first candidate is visually incorrect.'},
      {id:'done',type:'done',summary:'Compared'}];
    if(turn===2)assert.match(payload.results.at(-1).error,/Inspect this candidate/);
    if(turn===3){assert.deepEqual(payload.imagePaths,['wrong.mp4.png']);assert.equal(payload.context.visualInputs[0].candidateId,'candidate-s-wrong');}
    if(turn===4){assert.deepEqual(payload.imagePaths,['wrong.mp4.png','right.mp4.png']);assert.equal(payload.context.visualInputs[1].candidateId,'candidate-s-right');assert.equal(payload.results.at(-1).note,'The first candidate is visually incorrect.');}
    return {actions:[actions[turn++]]};
  }};
  registerMediaOrchestrator({register:(kind,fn)=>{if(kind==='media-edit')handler=fn;}},repository,services);
  await handler({message:'Compare the clips'}, {initialCheckpoint:{},jobId:'job',projectId:'p',assertActive:()=>{},progress:()=>{},log:()=>{},checkpoint:value=>{checkpoint=structuredClone(value);},getDocument:()=>document,commit:()=>({revision:1})});
  assert.equal(turn,5);assert.equal(checkpoint.images.length,2);assert.equal(checkpoint.candidates.find(([id])=>id==='candidate-s-right')[1].inspected,true);
});
