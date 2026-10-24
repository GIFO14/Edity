const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
// Hidden packaged regression against an isolated copy of a real recording.
module.exports=async({win,api,until,root,report,source})=>{
 const project=await api('createManagedProject',source,{words:[{word:'retained',start:0,end:.5,confidence:1},{word:'removed',start:.6,end:.9,confidence:1}],segments:[],deletedRanges:[{id:'remove',start:.6,end:.9,wordIndices:[1]}],language:'en'});
 let d=await api('getProjectDocument',project.id);const asset=d.composition.assets.baseAsset;
 await api('commitProject',{id:'simulate-previous-preparation-failure',projectId:d.id,baseRevision:d.revision,actor:'migration',operations:[{type:'asset',asset:{...asset,status:'failed'}}],skipHistory:true});
 const failed={id:'previous-fps-failure',kind:'asset',projectId:d.id,payload:{assetId:asset.id},dependencies:[],requestId:`prepare-existing-${asset.id}-${d.transcriptRevision||0}`,status:'failed',progress:15,generationId:1,createdAt:'2026-09-30',error:'Invalid document.assets.baseAsset.fps'};
 // A previous process persisted the failure; the unit test covers loading this
 // exact job. This packaged flow covers retrying the failed document via IPC.
 report.previousFailure=failed.error;
 const checkpoint=()=>fs.writeFileSync(process.env.EDITY_TEST_REPORT,JSON.stringify(report,null,2));
 await win.loadFile(path.join(__dirname,'../frontend/dist/index.html'),{query:{project:d.id,embedded:'1'}});
 await until(async()=>{const jobs=await api('listJobs',d.id),job=jobs.find(j=>j.kind==='asset');if(job?.status==='failed')throw new Error(job.error);return job?.status==='complete';});
 d=await api('getProjectDocument',d.id);const prepared=d.composition.assets.baseAsset;
 assert.equal(prepared.status,'ready');assert.deepEqual(prepared.fps,{num:971401,den:16190});
 assert.equal(d.words[0].word,'retained');assert.deepEqual(d.deletedRanges,[{id:'remove',start:.6,end:.9,wordIndices:[1]}]);
 report.checks.push('Real W2-5 recording prepares with its exact 971401/16190 frame rate; transcript edits preserved');
 checkpoint();
 await until(()=>win.webContents.executeJavaScript(`document.querySelector('video')?.readyState>=2`),60000);
 report.playerState=await win.webContents.executeJavaScript(`({text:document.body.textContent.slice(-500),canvas:Array.from(document.querySelectorAll('canvas')).map(c=>[c.width,c.height]),video:{duration:document.querySelector('video')?.duration,readyState:document.querySelector('video')?.readyState}})`);checkpoint();
 await until(()=>win.webContents.executeJavaScript(`Boolean(document.querySelector('canvas')?.width>=640 && !document.body.textContent.includes(': failed'))`),60000);
 // Actual rendered pixels, rather than merely a loaded video element.
 const png=await until(async()=>{const data=await win.webContents.executeJavaScript(`document.querySelector('canvas')?.toDataURL('image/png')`);if(!data)return null;const image=require('electron').nativeImage.createFromDataURL(data),bytes=image.toBitmap();let min=255,max=0;for(let i=0;i<bytes.length;i+=4){min=Math.min(min,bytes[i]);max=Math.max(max,bytes[i]);}return max-min>30?data:null;},60000);
 const target=path.join(path.dirname(process.env.EDITY_TEST_REPORT),'recovered-playback.png');fs.writeFileSync(target,Buffer.from(png.split(',')[1],'base64'));
 report.checks.push('Packaged player renders nonblack frames without the failed-resource error');
 checkpoint();
 const document=await api('getRenderDocument',d.id),backend=await api('getBackendUrl');
 const {manifestRequest}=require('./manifest-request');
 const request=manifestRequest(document);request.keep_segments=request.keep_segments.map(s=>({start:s.start,end:Math.min(2,s.end)})).filter(s=>s.end>s.start);
 const response=await fetch(backend+'/preview/manifest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});
 assert.ok(response.ok);const manifest=await response.json();
 const outputPath=path.join(path.dirname(process.env.EDITY_TEST_REPORT),'recovered-export.mp4');
 const exported=await api('startJob',{kind:'export',projectId:d.id,payload:{document,manifest,outputPath,width:1920,height:1080,format:'mp4',captions:'none',studioSound:true}});
 await until(async()=>{const job=await api('getJob',exported.id);if(['failed','cancelled'].includes(job.status))throw new Error(job.error);return job.status==='complete';});
 assert.ok(fs.statSync(outputPath).size>1000);report.exportedFile=outputPath;
 report.checks.push('Packaged worker exports the recovered recording at 1080p with Studio Sound');
 checkpoint();
 const fresh=await api('createManagedProject',source,{words:[],segments:[],deletedRanges:[],language:'en'});
 await api('openManagedProject',fresh.id);
 await until(async()=>{const job=(await api('listJobs',fresh.id)).find(j=>j.kind==='asset');if(job?.status==='failed')throw new Error(job.error);return job?.status==='complete';});
 const freshDocument=await api('getProjectDocument',fresh.id);
 assert.equal(freshDocument.composition.assets.baseAsset.status,'ready');assert.deepEqual(freshDocument.composition.assets.baseAsset.fps,prepared.fps);
 report.checks.push('A newly created project with the same recording prepares successfully');
 report.fps=prepared.fps;report.projectDirectory=path.join(root,d.id);report.renderedFrame=target;
};
