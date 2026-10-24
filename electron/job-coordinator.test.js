const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const {JobCoordinator}=require('./job-coordinator');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'edity-jobs-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const commits=[];const repository={getDocument:()=>({words:[{}],processing:{status:'done'}}),commit:tx=>commits.push(tx)};return {dir,commits,repository,jobs:new JobCoordinator(dir,repository,{ai:2,download:4,prepare:2,export:1})};}
test('resource budgets and project isolation hold while editors are absent',async t=>{
 const {jobs}=setup(t);let active=0,max=0,completed=0;
 jobs.register('export',async()=>{max=Math.max(max,++active);await wait(10);active--;completed++;return {};},{resource:'export'});
 for(let i=0;i<4;i++)jobs.start({kind:'export',projectId:`project-${i}`});
 while(completed<4)await wait(10);assert.equal(max,1);assert.equal(jobs.list().filter(j=>j.status==='complete').length,4);
});
test('cancellation invalidates late commits and children; cancelled jobs stay cancelled after recovery',async t=>{
 const {dir,jobs,commits,repository}=setup(t);let entered;const started=new Promise(resolve=>entered=resolve);
 jobs.register('ai',async(_payload,context)=>{entered();await wait(20);context.commit({id:'late'});},{resource:'ai'});
 const job=jobs.start({kind:'ai',projectId:'project'});await started;await jobs.cancel(job.id);assert.equal(commits.length,0);assert.equal(jobs.get(job.id).status,'cancelled');assert.equal(new JobCoordinator(dir,repository).get(job.id).status,'cancelled');
});
test('dependencies are waiting and request retries are deduplicated',async t=>{
 const {jobs}=setup(t);jobs.register('prepare',async()=>{await wait(20);return {};});
 const dependency=jobs.start({kind:'prepare',projectId:'one'});
 const job=jobs.start({kind:'prepare',projectId:'two',dependencies:[dependency.id],requestId:'request'});
 assert.equal(jobs.get(job.id).status,'waiting');assert.equal(jobs.start({kind:'prepare',projectId:'two',requestId:'request'}).id,job.id);
 while(jobs.get(job.id).status!=='complete')await wait(10);
});
test('running jobs recover as interrupted, with safe preparations resumable',async t=>{
 const {dir,repository}=setup(t);const id='test';fs.writeFileSync(path.join(dir,'test.json'),JSON.stringify({id,kind:'prepare',projectId:'one',payload:{},dependencies:[],status:'running',generationId:1,createdAt:'2026-01-01'}));
 const recovered=new JobCoordinator(dir,repository);assert.equal(recovered.get(id).status,'interrupted');recovered.register('prepare',async()=>({}),{resumable:true});while(recovered.get(id).status!=='complete')await wait(10);
});
