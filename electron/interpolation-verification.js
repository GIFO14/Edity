const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
module.exports=async({win,api,until,report})=>{
 const root=path.dirname(process.env.EDITY_TEST_REPORT),source=path.join(root,'screen-1080p30.mp4'),hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),originalHash=hash(source),pause=ms=>new Promise(r=>setTimeout(r,ms));
 require('electron').app.on('web-contents-created',(_event,contents)=>{
  contents.debugger.attach('1.3');contents.debugger.sendCommand('Network.enable');contents.debugger.sendCommand('Runtime.enable');
  contents.debugger.on('message',(_e,method,params)=>{if(method==='Network.requestWillBeSent'&&/preview\/manifest/.test(params.request.url)||method==='Runtime.exceptionThrown'||method==='Runtime.consoleAPICalled')fs.appendFileSync(path.join(root,'renderer-console.log'),JSON.stringify({method,params})+'\n');});
 });
 const phase=name=>fs.writeFileSync(path.join(root,'phase.json'),JSON.stringify({name,at:new Date().toISOString()}));
 await api('initializeProjectDefaults',{processing:{language:'en'}});
 phase('desktop-import-dialog');win.showInactive();
 const dialog=require('electron').dialog,originalDialog=dialog.showOpenDialog;
 try{
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});
  await win.webContents.executeJavaScript(`document.querySelector('button[title="Add videos"]').click()`);
  await until(()=>win.webContents.executeJavaScript(`(()=>{const c=document.querySelector('input[aria-label="Millorar fluïdesa a 60 FPS"]');return c&&!c.disabled&&document.body.innerText.includes('1920×1080');})()`),20000);
  assert.equal(await win.webContents.executeJavaScript(`document.querySelector('input[aria-label="Millorar fluïdesa a 60 FPS"]').checked`),true);
  fs.writeFileSync(path.join(root,'import-dialog.png'),(await win.webContents.capturePage()).toPNG());
  for(const expected of [false,true]){await win.webContents.executeJavaScript(`document.querySelector('input[aria-label="Millorar fluïdesa a 60 FPS"]').click()`);await until(async()=>(await api('getProjectDefaults')).processing.interpolate60===expected,5000);}
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Cancel').click()`);report.desktopImportCheckbox=true;
 }finally{dialog.showOpenDialog=originalDialog;}
 const descriptor=JSON.parse(fs.readFileSync(path.join(process.env.EDITY_AGENT_BRIDGE_DIRECTORY,fs.readdirSync(process.env.EDITY_AGENT_BRIDGE_DIRECTORY).find(f=>f.endsWith('.json'))),'utf8'));
 const rpc=async(method,params)=>{const response=await fetch(descriptor.url+'/v1/rpc',{method:'POST',headers:{Authorization:'Bearer '+descriptor.token,'Content-Type':'application/json'},body:JSON.stringify({id:crypto.randomUUID(),method,params})}),body=await response.json();if(body.error)throw Error(body.error.message);return body.result;};
 const defaults=await rpc('defaults.get',{});assert.equal(defaults.processing.interpolate60,true);
 const words=[{id:'first',text:'First',startUs:200000,endUs:600000},{id:'cut',text:'cut',startUs:1000000,endUs:1200000},{id:'last',text:'last',startUs:2000000,endUs:2700000}];
 const input=(file,items)=>({path:file,sha256:hash(file),transcript:{language:'en',segments:[{startUs:0,endUs:items.at(-1)?.endUs||0,words:items}]}});
 const waitJob=id=>until(async()=>{const j=await api('getJob',id);if(['failed','partial'].includes(j.status))throw Error(j.error||j.stage);return j.status==='complete'?j:null;},240000);
 if(!process.env.EDITY_TEST_INTERPOLATION_SKIP_CANCEL){phase('cancel-owned-interpolation');
 const first=await rpc('projects.create',{idempotencyKey:'qa-cancel-interpolation',title:'Cancelled interpolation QA',mode:'reconciled',show:false,sources:[input(source,words)]});
 const derivativeRoot=path.join(path.dirname(process.env.EDITY_MEDIA_CACHE),'interpolated-video');
 await until(()=>fs.existsSync(derivativeRoot)&&fs.readdirSync(derivativeRoot).some(f=>f.endsWith('.partial.mp4')||f.endsWith('.partial.frames')),30000);if(process.env.EDITY_TEST_EXPECT_GPU)await until(async()=>(await api('getJob',first.jobId)).stage.includes('RIFE'),30000);await pause(250);
 await api('cancelJob',first.jobId);await until(async()=>(await api('getJob',first.jobId)).status==='cancelled',20000);
 const cancelled=await api('getProjectDocument',first.projectId);assert.equal(cancelled.processing.nextIndex,0);assert.equal(cancelled.processing.status,'error');assert.equal(hash(source),originalHash);
 phase('resume-interpolation');await api('retryJob',first.jobId);await waitJob(first.jobId);
 const resumed=await api('getProjectDocument',first.projectId);assert.deepEqual(resumed.composition.canvas.fps,{num:60,den:1});assert.deepEqual(resumed.words.map(w=>w.id),['first','cut','last']);assert.equal(resumed.clips[0].sourceSha256,originalHash);report.cancelResume=true;}
 phase('mixed-clip-import');
 const imported=await rpc('projects.create',{idempotencyKey:'qa-interpolation-mixed',title:'60 FPS imported project',mode:'reconciled',show:false,sources:[input(source,words),input(path.join(root,'native-60.mp4'),[{id:'native-word',text:'native',startUs:0,endUs:300000}])]});
 await waitJob(imported.jobId);let doc=await api('getProjectDocument',imported.projectId);
 assert.deepEqual(doc.composition.canvas.fps,{num:60,den:1});assert.equal(doc.clips[0].interpolation.cached,true);assert.equal(doc.clips[1].interpolation.applied,false);assert.equal(doc.clips[1].start,3);assert.equal(doc.words[3].start,3);
 report.motionEngine=doc.clips[0].interpolation.engine;report.motionGpu=doc.clips[0].interpolation.gpuDevice;if(process.env.EDITY_TEST_EXPECT_GPU)assert.equal(report.motionEngine,'rife-ncnn-vulkan-gpu');
 const ids=doc.words.map(w=>w.id),runtime=require('../shared/composition-runtime.cjs');
 await api('commitProject',{id:'qa-cut-and-text',projectId:doc.id,baseRevision:doc.revision,actor:'manual',label:'QA narration cut and 60 FPS overlay',documentChanges:{deletedRanges:[{id:'remove-one',start:1,end:1.2,cutStart:1,cutEnd:1.2,wordIndices:[1]}]},operations:[{type:'add',element:{id:'qa-title',kind:'text',trackId:'text',order:1,label:'60 FPS animation',enabled:true,createdBy:'manual',placement:{kind:'project',startOffsetUs:0,endOffsetUs:0},transform:{...runtime.defaultTransform(),y:.88,height:.15},presets:[runtime.presetInstance('grow')],sourceInUs:0,endPolicy:'hold',text:'Real 60 FPS',textStyle:runtime.defaultTextStyle()}}]});
 await api('undoProject',doc.id);assert.deepEqual((await api('getProjectDocument',doc.id)).deletedRanges,[]);await api('redoProject',doc.id);doc=await api('getProjectDocument',doc.id);assert.deepEqual(doc.words.map(w=>w.id),ids);assert.deepEqual(doc.composition.canvas.fps,{num:60,den:1});report.undoRedoAndWordIds=true;
 phase('preview-sixty');win.showInactive();await until(()=>win.webContents.executeJavaScript(`!![...document.querySelectorAll('aside span[title]')].find(n=>n.title==='60 FPS imported project')`),10000);
 await win.webContents.executeJavaScript(`[...document.querySelectorAll('aside span[title]')].find(n=>n.title==='60 FPS imported project').closest('button').click()`);
 const view=await until(()=>win.getBrowserViews().find(v=>{try{return new URL(v.webContents.getURL()).searchParams.get('project')===doc.id;}catch{return false;}}),45000),ui=code=>view.webContents.executeJavaScript(code,true);
 await pause(5000);fs.writeFileSync(path.join(root,'preview-probe.json'),JSON.stringify(await ui(`({video:[...document.querySelectorAll('video')].map(v=>({duration:v.duration,time:v.currentTime,readyState:v.readyState,src:v.currentSrc,dataset:{...v.dataset},error:v.error?.message})),canvases:[...document.querySelectorAll('canvas')].map(c=>({width:c.width,height:c.height})),text:document.body.innerText})`),null,2));fs.writeFileSync(path.join(root,'preview-probe.png'),(await view.webContents.capturePage()).toPNG());
 await until(()=>ui(`document.querySelector('video')?.readyState>=2&&document.querySelector('canvas')?.width===1280&&document.querySelector('video').dataset.precisePending!=='1'`),20000);view.webContents.setAudioMuted(true);
 await ui(`window.__qaDraws=new Set();const draw=WebGL2RenderingContext.prototype.drawArrays;WebGL2RenderingContext.prototype.drawArrays=function(...args){window.__qaDraws.add(Math.round(document.querySelector('video').currentTime*60));return draw.apply(this,args);};void 0;`);
 await ui(`document.querySelector('video').play()`);await pause(1200);await ui(`document.querySelector('video').pause()`);report.previewDrawCalls=await ui('window.__qaDraws.size');assert.ok(report.previewDrawCalls>=45,'Compositor remained limited to 30 FPS');
 fs.writeFileSync(path.join(root,'preview.png'),(await view.webContents.capturePage()).toPNG());
 phase('export-sixty');doc=await api('getProjectDocument',doc.id);const snapshot=await rpc('exports.prepare',{idempotencyKey:'qa-review-sixty',projectId:doc.id,expectedRevision:doc.revision});assert.deepEqual(snapshot.canvas.fps,{num:60,den:1});report.exportFreeBytes=require('node:os').freemem();
 const outputPath=path.join(root,'export-1080p60.mp4'),started=Date.now(),nativeHost=require('node:os'),nativeFree=nativeHost.freemem;let done60;
 // The tiny fixture uses one native renderer (< 0.4 GiB observed), even when
 // the ordinary resource gate conservatively chooses compatible encoding.
 if(process.env.EDITY_TEST_FORCE_NATIVE)nativeHost.freemem=()=>4*1024**3;
 try{const exported=await rpc('exports.start',{idempotencyKey:'qa-export-sixty',snapshotId:snapshot.snapshotId,outputPath,width:1920,height:1080,format:'mp4'});done60=await waitJob(exported.jobId);}finally{nativeHost.freemem=nativeFree;}
 if(process.env.EDITY_TEST_FORCE_NATIVE)assert.match(done60.result?.metrics?.parts?.[0]?.metrics?.hardwareEncoder||'',/webcodecs/);
 const ffprobe=require('./ffmpeg-paths').locateTool('ffprobe'),probe=file=>{const r=spawnSync(ffprobe,['-v','error','-count_frames','-show_streams','-show_format','-of','json',file],{windowsHide:true,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);},info=probe(outputPath),video=info.streams.find(s=>s.codec_type==='video');assert.equal(video.avg_frame_rate,'60/1');assert.ok(Math.abs(Number(info.format.duration)-snapshot.durationUs/1e6)<.05);assert.equal(Number(video.nb_read_frames),Math.ceil(snapshot.durationUs/1e6*60));
 report.export60={seconds:(Date.now()-started)/1000,durationUs:snapshot.durationUs,frames:Number(video.nb_read_frames),fps:video.avg_frame_rate,width:video.width,height:video.height,metrics:done60.result?.metrics};
 phase('compatible-export-sixty');const host=require('node:os'),freeMemory=host.freemem;host.freemem=()=>2*1024**3;
 try{const outputPath=path.join(root,'export-compatible-1080p60.mp4'),started=Date.now(),job=await rpc('exports.start',{idempotencyKey:'qa-compatible-sixty',snapshotId:snapshot.snapshotId,outputPath,width:1920,height:1080,format:'mp4'}),done=await waitJob(job.jobId),v=probe(outputPath).streams.find(s=>s.codec_type==='video');assert.equal(v.avg_frame_rate,'60/1');assert.equal(Number(v.nb_read_frames),198);report.compatible60={seconds:(Date.now()-started)/1000,frames:Number(v.nb_read_frames),metrics:done.result?.metrics};}finally{host.freemem=freeMemory;}
 phase('disabled-import');const disabled=await rpc('projects.create',{idempotencyKey:'qa-no-interpolation',title:'30 FPS regression',mode:'reconciled',show:false,options:{interpolate60:false},sources:[input(source,words)]});await waitJob(disabled.jobId);const old=await api('getProjectDocument',disabled.projectId);assert.deepEqual(old.composition.canvas.fps,{num:30,den:1});
 const review30=await rpc('exports.prepare',{idempotencyKey:'qa-review-thirty',projectId:old.id,expectedRevision:old.revision}),oldOutput=path.join(root,'export-1080p30.mp4'),start30=Date.now(),j30=await rpc('exports.start',{idempotencyKey:'qa-export-thirty',snapshotId:review30.snapshotId,outputPath:oldOutput,width:1920,height:1080});const done30=await waitJob(j30.jobId);const oldProbe=probe(oldOutput);assert.equal(oldProbe.streams.find(s=>s.codec_type==='video').avg_frame_rate,'30/1');report.export30={seconds:(Date.now()-start30)/1000,metrics:done30.result?.metrics};
 assert.equal(hash(source),originalHash);report.originalUnchanged=true;report.checks.push('Real bridge default/opt-out imports, owned worker cancellation/resume, shared derivative reuse, mixed clips, stable word IDs/time maps, undo/redo, 60 FPS preview and 1080p60/30 exports through review snapshots');phase('done');
};
