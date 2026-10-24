const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const {JobStateWriter}=require('./job-state-writer'),{JobCoordinator}=require('./job-coordinator');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function folder(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'edity-state-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
test('EPERM retries do not throw and newest terminal snapshot replaces older progress',async t=>{
 const dir=folder(t);let attempts=0,warnings=0;
 const writer=new JobStateWriter(dir,{io:{...fs,renameSync(...args){if(++attempts<=3)throw Object.assign(Error('Locked'),{code:'EPERM'});return fs.renameSync(...args);}},onWarning:()=>warnings++});t.after(()=>writer.stop());
 assert.equal(writer.write('job',JSON.stringify({status:'running',progress:1})),false);
 writer.write('job',JSON.stringify({status:'complete',progress:100}));
 assert.ok(await writer.flush(2000));assert.equal(warnings,1);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'job.json'))),{status:'complete',progress:100});
});
test('a complete temporary snapshot survives shutdown and is recovered ahead of stale running JSON',async t=>{
 const dir=folder(t),old={id:'job',kind:'export',projectId:'p',status:'running',progress:10,stateRevision:1,generationId:1,payload:{},dependencies:[]};
 fs.writeFileSync(path.join(dir,'job.json'),JSON.stringify(old));
 const writer=new JobStateWriter(dir,{io:{...fs,renameSync(){throw Object.assign(Error('Locked'),{code:'EPERM'});}}});
 writer.write('job',JSON.stringify({...old,status:'complete',progress:100,stateRevision:2,result:{outputPath:'finished.mp4'}}));writer.stop();
 const jobs=new JobCoordinator(dir,{getDocument:()=>({})});t.after(()=>jobs.writer.stop());assert.equal(jobs.get('job').status,'complete');assert.equal(jobs.get('job').result.outputPath,'finished.mp4');
});
test('identical frame progress does not rewrite or broadcast the full export payload',async t=>{
 const dir=folder(t),jobs=new JobCoordinator(dir,{getDocument:()=>({})});t.after(()=>jobs.writer.stop());let events=0;jobs.on('changed',()=>events++);
 jobs.register('export',async(_p,ctx)=>{for(let i=0;i<500;i++)ctx.progress(25,'Rendering');ctx.progress(25,'Finalizing');return{};});
 const job=jobs.start({kind:'export',projectId:'p',payload:{large:'x'.repeat(100000)}});
 while(jobs.get(job.id).status!=='complete')await pause(5);assert.equal(events,5);assert.equal(jobs.get(job.id).progress,100);
});
test('Windows open file handle causes EPERM and then recovers without losing the latest state',{skip:process.platform!=='win32'},async t=>{
 const dir=folder(t),file=path.join(dir,'job.json'),ready=path.join(dir,'ready'),script=path.join(dir,'lock.ps1');fs.writeFileSync(file,'{"progress":0}');
 fs.writeFileSync(script,'param([string]$Target,[string]$Ready)\n$s=[IO.File]::Open($Target,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)\n[IO.File]::WriteAllText($Ready,"ready")\nStart-Sleep -Milliseconds 300\n$s.Dispose()');
 const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-File',script,'-Target',file,'-Ready',ready],{windowsHide:true,stdio:'ignore'});const exited=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});t.after(()=>child.kill());
 for(let i=0;!fs.existsSync(ready)&&i<100;i++)await pause(20);assert.ok(fs.existsSync(ready),'File lock helper started');
 let warning;const writer=new JobStateWriter(dir,{onWarning:w=>warning=w});t.after(()=>writer.stop());assert.equal(writer.write('job','{"progress":100}'),false);assert.ok(['EPERM','EACCES','EBUSY'].includes(warning.code));assert.ok(await writer.flush(2000));await exited;assert.equal(JSON.parse(fs.readFileSync(file)).progress,100);
});
