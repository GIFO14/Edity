const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createExternalAgentTools}=require('./external-agent-tools'),{createProjectStore}=require('./project-store'),{ProjectRepository}=require('./project-repository'),{JobCoordinator}=require('./job-coordinator');

test('CLI/plugin context exposes source-map silence cuts even without an expensive manifest',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'edity-agent-boundaries-'));let coordinator;
  try{
    const store=createProjectStore(path.join(root,'projects')),created=await store.create(path.join(__dirname,'../tests/fixtures/composition/base.mp4'),{words:[],segments:[],deletedRanges:[]}),repository=new ProjectRepository(store);
    const d=repository.getDocument(created.id),clips=structuredClone(d.clips);
    clips[0].sourceMap={kind:'silence-processed',marginSeconds:.05,segments:[{originalStartUs:0,originalEndUs:1000000,processedStartUs:0,processedEndUs:1000000},{originalStartUs:3000000,originalEndUs:4000000,processedStartUs:1000000,processedEndUs:2000000}]};
    repository.commit({id:'map',projectId:d.id,baseRevision:d.revision,actor:'migration',label:'Prepared source map',operations:[],documentChanges:{clips}});
    coordinator=new JobCoordinator(path.join(root,'jobs'),repository);
    const {methods}=createExternalAgentTools({store,repository,coordinator,services:{service:async()=>{throw new Error('Unexpected service call');}},stateDirectory:path.join(root,'state'),processingJobs:{ensure:()=>{}}});
    const context=await methods['context.get']({projectId:d.id,includeManifest:false,includeComposition:false});
    assert.equal(context.editBoundaries.silenceRemovals[0].removedUs,2000000);
    assert.equal(context.editBoundaries.silenceRemovals[0].editTimesUs,null);
    assert.equal(context.editBoundaries.silenceRemovals[0].marginSecondsPerSide,.05);
  }finally{await coordinator?.shutdown();assert.ok(path.resolve(root).startsWith(path.join(os.tmpdir(),'edity-agent-boundaries-')));fs.rmSync(root,{recursive:true,force:true});}
});
test('external expectedRevision is rechecked after slow manifest computation before committing a cut',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'edity-agent-race-'));let coordinator;
  try{
    const source=path.join(root,'source.mp4');fs.copyFileSync(path.join(__dirname,'../tests/fixtures/composition/base.mp4'),source);
    const store=createProjectStore(path.join(root,'projects')),created=await store.create(source,{words:[{word:'keep',start:0,end:1,confidence:1}],segments:[],deletedRanges:[]}),repository=new ProjectRepository(store);coordinator=new JobCoordinator(path.join(root,'jobs'),repository);
    const services={service:async(route,body)=>{
      if(route==='/composition/fonts')return {families:[]};
      if(route==='/composition/validate-actions')return {actions:body.actions};
      if(route==='/preview/manifest'){const d=repository.getDocument(created.id);repository.commit({id:'manual-during-manifest',projectId:created.id,baseRevision:d.revision,actor:'manual',label:'Concurrent manual edit',operations:[],documentChanges:{title:'Manual title preserved'}});return {durationUs:1000000,segments:[],keepSegments:[]};}
      throw new Error('Unexpected service call: '+route);
    }};
    const {methods}=createExternalAgentTools({store,repository,coordinator,services,stateDirectory:path.join(root,'state'),processingJobs:{ensure:()=>{}},editingLibrary:{read:()=>({})}});
    const session=await methods['sessions.open']({projectId:created.id,idempotencyKey:'session'}),started=await methods['actions.execute']({sessionId:session.sessionId,idempotencyKey:'cut',expectedRevision:0,action:{id:'cut',type:'edit',deleteRanges:[{startIndex:0,endIndex:0}]}});
    let job;for(let n=0;n<100;n++){job=coordinator.get(started.jobId);if(job.status==='failed')break;await new Promise(r=>setTimeout(r,5));}
    assert.equal(job.status,'failed');assert.equal(job.errorCode,'REVISION_CONFLICT');const after=repository.getDocument(created.id);assert.equal(after.title,'Manual title preserved');assert.deepEqual(after.deletedRanges,[]);
  }finally{await coordinator?.shutdown();assert.ok(path.resolve(root).startsWith(path.join(os.tmpdir(),'edity-agent-race-')));fs.rmSync(root,{recursive:true,force:true});}
});
test('retry recovers a committed edit even if its tool checkpoint was lost and the transcript was changed later',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'edity-agent-race-'));let coordinator;
  try{
    const source=path.join(root,'source.mp4');fs.copyFileSync(path.join(__dirname,'../tests/fixtures/composition/base.mp4'),source);
    const store=createProjectStore(path.join(root,'projects')),created=await store.create(source,{words:[{word:'keep',start:0,end:1,confidence:1}],segments:[],deletedRanges:[]}),repository=new ProjectRepository(store);coordinator=new JobCoordinator(path.join(root,'jobs'),repository);
    const services={service:async(route,body)=>{if(route==='/composition/fonts')return {families:[]};if(route==='/composition/validate-actions')return {actions:body.actions};if(route==='/preview/manifest')return {durationUs:1000000,segments:[],keepSegments:[]};throw new Error('Unexpected service call');}};
    const {methods,states}=createExternalAgentTools({store,repository,coordinator,services,stateDirectory:path.join(root,'state'),processingJobs:{ensure:()=>{}},editingLibrary:{read:()=>({})}});
    const session=await methods['sessions.open']({projectId:created.id,idempotencyKey:'session'}),action={id:'cut',type:'edit',deleteRanges:[{startIndex:0,endIndex:0}]};
    const wait=async id=>{for(let n=0;n<100;n++){const j=coordinator.get(id);if(['complete','failed'].includes(j.status))return j;await new Promise(r=>setTimeout(r,5));}throw new Error('timeout');};
    const first=await methods['actions.execute']({sessionId:session.sessionId,idempotencyKey:'first',expectedRevision:0,action});assert.equal((await wait(first.jobId)).status,'complete');
    const saved=states.read('session',session.sessionId);saved.checkpoint.applied=[];saved.checkpoint.results=[];states.write('session',saved.id,saved);
    const d=repository.getDocument(created.id);repository.commit({id:'manual-transcript-change',projectId:created.id,baseRevision:d.revision,actor:'manual',label:'Manual transcript replacement',operations:[],documentChanges:{words:[],deletedRanges:[]}});
    const retry=await methods['actions.execute']({sessionId:session.sessionId,idempotencyKey:'recover',expectedRevision:0,action}),completed=await wait(retry.jobId);assert.equal(completed.status,'complete');assert.equal(completed.result.duplicate,true);assert.equal(repository.getDocument(created.id).revision,2);assert.deepEqual(repository.getDocument(created.id).words,[]);
  }finally{await coordinator?.shutdown();assert.ok(path.resolve(root).startsWith(path.join(os.tmpdir(),'edity-agent-race-')));fs.rmSync(root,{recursive:true,force:true});}
});
