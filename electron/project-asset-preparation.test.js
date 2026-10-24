const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createProjectStore}=require('./project-store');
const {ProjectRepository}=require('./project-repository');
const {JobCoordinator}=require('./job-coordinator');
const {registerMediaJobs}=require('./media-jobs');
const {prepareProjectAssets}=require('./project-asset-preparation');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function terminal(jobs,id){for(let n=0;n<200;n++){const job=jobs.get(id);if(['complete','failed'].includes(job.status))return job;await wait(10);}throw new Error('Preparation timed out');}

test('opening a project recovers persisted fps preparation failure and preserves transcript edits',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'edity-fps-recovery-'));
 t.after(()=>{assert.ok(root.startsWith(os.tmpdir()+path.sep));fs.rmSync(root,{recursive:true,force:true});});
 const store=createProjectStore(path.join(root,'projects'));
 const project=await store.create(path.join(__dirname,'../tests/fixtures/composition/base.mp4'),{
  words:[{word:'retained',start:0,end:.4,confidence:1},{word:'removed',start:.5,end:.8,confidence:1}],segments:[],
  deletedRanges:[{id:'removal',start:.5,end:.8,wordIndices:[1]}],chatMessages:[]});
 const repo=new ProjectRepository(store),before=repo.getDocument(project.id),asset=before.composition.assets.baseAsset;
 repo.commit({id:'old-failure',projectId:project.id,baseRevision:before.revision,actor:'migration',operations:[{type:'asset',asset:{...asset,status:'failed'}}],skipHistory:true});
 const dir=path.join(root,'jobs');fs.mkdirSync(dir);
 fs.writeFileSync(path.join(dir,'old-job.json'),JSON.stringify({id:'old-job',kind:'asset',projectId:project.id,payload:{assetId:asset.id},dependencies:[],requestId:`prepare-existing-${asset.id}-0`,status:'failed',progress:15,generationId:1,createdAt:'2026-09-30',error:'Invalid document.assets.baseAsset.fps'}));
 const jobs=new JobCoordinator(dir,repo);
 const http=require('node:http');let calls=0;
 const server=http.createServer((req,res)=>{calls++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({hash:'prepared',status:'ready',width:1920,height:1080,durationUs:2000000,hasAudio:true,hasAlpha:false,fps:{num:971401,den:16190}}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 registerMediaJobs(jobs,repo,`http://127.0.0.1:${server.address().port}`);
 prepareProjectAssets(jobs,repo,repo.getDocument(project.id));
 prepareProjectAssets(jobs,repo,repo.getDocument(project.id));
 const completed=await terminal(jobs,'old-job');assert.equal(completed.status,'complete',completed.error);assert.equal(calls,1);assert.equal(jobs.list().length,1);
 const after=repo.getDocument(project.id);assert.equal(after.composition.assets.baseAsset.status,'ready');assert.deepEqual(after.composition.assets.baseAsset.fps,{num:971401,den:16190});
 assert.deepEqual(after.words,before.words);assert.deepEqual(after.deletedRanges,before.deletedRanges);
 prepareProjectAssets(jobs,repo,after);assert.equal(jobs.list().length,1);
});

test('a failed retry stays terminal until another open; missing and processing resources are skipped',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'edity-preparation-retry-'));
 t.after(()=>{assert.ok(root.startsWith(os.tmpdir()+path.sep));fs.rmSync(root,{recursive:true,force:true});});
 const doc={id:'project',revision:1,composition:{assets:{asset:{id:'asset',kind:'video',hash:'',status:'failed'}}}};
 const repo={getDocument:()=>doc,directory:()=>root},jobs=new JobCoordinator(path.join(root,'jobs'),repo);let calls=0;
 jobs.register('asset',async()=>{calls++;throw new Error('Invalid file');});
 prepareProjectAssets(jobs,repo,doc);const id=jobs.list()[0].id;assert.equal((await terminal(jobs,id)).status,'failed');
 await wait(30);assert.equal(calls,1);
 prepareProjectAssets(jobs,repo,doc);assert.equal((await terminal(jobs,id)).status,'failed');assert.equal(calls,2);
 doc.composition.assets.asset.status='missing';prepareProjectAssets(jobs,repo,doc);assert.equal(calls,2);
 doc.composition.assets.asset.status='failed';doc.processing={status:'running'};prepareProjectAssets(jobs,repo,doc);assert.equal(calls,2);
});
