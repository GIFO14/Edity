const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async({win,api,until,root,report,fixture})=>{
 const {manifestRequest}=require('./manifest-request');
 const project=await api('createManagedProject',path.join(fixture,'base.mp4'),{title:'Resolve handoff',words:[{word:'keep',start:0,end:.35,confidence:1},{word:'remove',start:.55,end:.8,confidence:1},{word:'keep',start:1.1,end:1.7,confidence:1}],segments:[],deletedRanges:[{id:'delete',start:.55,end:.8,wordIndices:[1]}],language:'en'});
 await api('openManagedProject',project.id);
 await until(async()=>{const job=(await api('listJobs',project.id)).find(j=>j.kind==='asset');if(job?.status==='failed')throw new Error(job.error);return job?.status==='complete';});
 let document=await api('getProjectDocument',project.id);const backend=await api('getBackendUrl');
 let response=await fetch(backend+'/preview/manifest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(manifestRequest(document))});assert.ok(response.ok);let manifest=await response.json();
 const run=async(document,manifest,outputPath,copyMedia)=>{
  const started=await api('startJob',{kind:'resolve-export',projectId:project.id,payload:{document,manifest,outputPath,copyMedia}});
  return until(async()=>{const job=await api('getJob',started.id);if(['failed','cancelled'].includes(job.status))throw new Error(job.error);return job.status==='complete'?job:null;});
 };
 const destination=path.dirname(process.env.EDITY_TEST_REPORT),outputPath=path.join(destination,'Resolve handoff.fcpxml');
 const copied=await run(document,manifest,outputPath,true);assert.ok(copied.result.clipCount>=2);assert.ok(fs.existsSync(copied.result.mediaDirectory));
 assert.equal((fs.readFileSync(outputPath,'utf8').match(/<asset-clip /g)||[]).length,manifest.segments.length);
 report.checks.push('Packaged Resolve export uses the refined playback manifest, keeps every cut and copies real media to the SSD');
 report.fixtureXml=outputPath;report.clipCount=copied.result.clipCount;
 await win.loadFile(path.join(__dirname,'../frontend/dist/index.html'),{query:{project:project.id,embedded:'1'}});
 await until(()=>win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Export')`));
 await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Export').click()`);
 await until(()=>win.webContents.executeJavaScript(`Boolean(document.querySelector('option[value="resolve"]'))`));
 const ui=await win.webContents.executeJavaScript(`({target:document.querySelector('option[value="resolve"]').textContent,instructions:document.body.textContent.includes('File → Import → Timeline')})`);assert.equal(ui.target,'DaVinci Resolve (.fcpxml)');assert.ok(ui.instructions);
 report.checks.push('Export panel exposes the Resolve option, restores the completed handoff job and shows import instructions');
 if(process.env.EDITY_TEST_RESOLVE_PROJECT||process.env.EDITY_TEST_RESOLVE_JOB){
  const original=JSON.parse(fs.readFileSync(process.env.EDITY_TEST_RESOLVE_JOB||process.env.EDITY_TEST_RESOLVE_PROJECT,'utf8'));
  document={...(process.env.EDITY_TEST_RESOLVE_JOB?original.payload.document:original),id:project.id};
  if(process.env.EDITY_TEST_RESOLVE_JOB)manifest=original.payload.manifest;
  else{response=await fetch(backend+'/preview/manifest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(manifestRequest(document))});assert.ok(response.ok);manifest=await response.json();}
  const realOutput=path.join(destination,'Real project.fcpxml');const real=await run(document,manifest,realOutput,false);
  assert.equal(real.result.clipCount,manifest.segments.length);assert.ok(real.result.clipCount>20);assert.ok(!fs.readFileSync(realOutput,'utf8').includes('_media/'));
  report.checks.push('Complete real project exports as individually editable cuts referencing its existing cleaned source media');
  report.realXml=realOutput;report.realClipCount=real.result.clipCount;report.realDurationUs=real.result.durationUs;report.originalDurationUs=manifest.durationUs;report.timelineFrames=real.result.timelineFrames;
 }
};
