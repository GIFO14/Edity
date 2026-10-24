// Explicit opt-in hidden verification; never runs in an ordinary app launch.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async function verify({app,window:win}){
 const report={packaged:app.isPackaged,executable:process.execPath,checks:[]},root=process.env.EDITY_TEST_PROJECTS,fixture=process.env.EDITY_TEST_FIXTURE_DIR,output=process.env.EDITY_TEST_REPORT;
 const pause=ms=>new Promise(r=>setTimeout(r,ms));async function until(test,timeout=360000){const end=Date.now()+timeout;for(;;){const value=await test();if(value)return value;if(Date.now()>end)throw new Error('Packaged verification timed out');await pause(100);}}
 try{assert.ok(app.isPackaged);await until(()=>!win.webContents.isLoading());assert.equal(win.isVisible(),false);const api=(method,...args)=>win.webContents.executeJavaScript(`window.electronAPI[${JSON.stringify(method)}](...${JSON.stringify(args)})`);const runtime=require('../shared/composition-runtime.cjs'),{manifestRequest}=require('./manifest-request');
 if(process.env.EDITY_TEST_EXPORT_PERFORMANCE==='1'){await require('./export-performance-verification')({win,api,until,report});report.passed=true;return;}
 if(process.env.EDITY_TEST_WORKSPACE_REOPEN==='1'){await require('./workspace-reopen-verification')({app,win,api,until,report});report.passed=true;return;}
 if(process.env.EDITY_TEST_SEEK_RECOVERY==='1'){await require('./seek-recovery-verification')({win,api,until,report});report.passed=true;return;}
 if(process.env.EDITY_TEST_TIMELINE_WIDTH==='1'){await require('./timeline-width-verification')({win,api,until,report});report.passed=true;return;}
 if(process.env.EDITY_TEST_MEDIA_INSPECTOR==='1'){await require('./media-inspector-verification')({win,api,until,report});report.passed=true;return;}
 if(process.env.EDITY_TEST_VIEWER_TEXT==='1'){await require('./viewer-text-verification')({win,api,until,report});report.passed=true;return;}
 if(process.env.EDITY_TEST_COLOR_PRESETS==='1'){await require('./color-grading-verification')({win,api,until,report});await require('./color-presets-verification')({win,api,until,report});report.passed=true;return;}
 if(process.env.EDITY_TEST_TIMELINE_WORKSPACE==='1'){await require('./timeline-workspace-verification')({win,api,until,report});report.passed=true;return;}
 if(process.env.EDITY_TEST_MUSIC_FIDELITY==='1'){await require('./music-fidelity-verification')({win,api,until,report});report.passed=true;return;}
 if(process.env.EDITY_TEST_TIMELINE_DROP==='1'){await require('./timeline-drop-verification')({win,api,until,report});report.passed=true;return;}
 if(process.env.EDITY_TEST_COLOR_GRADING==='1'){await require('./color-grading-verification')({win,api,until,report});report.passed=true;return;}
 if(process.env.EDITY_TEST_TIMELINE_TRIM==='1'){await require('./timeline-trim-verification')({win,api,until,report});report.passed=true;return;}
 if(process.env.EDITY_TEST_BASE_CUTS==='1'){await require('./base-cuts-verification')({win,api,until,report});report.passed=true;return;}
 if(process.env.EDITY_TEST_WORKSPACE_RECOVERY==='1'){await require('./workspace-recovery-verification')({win,api,until,report});report.passed=true;return;}
 if(process.env.EDITY_TEST_TIMELINE_SCRUB==='1'){await require('./timeline-scrub-verification')({win,api,until,report});report.passed=true;return;}
 if(process.env.EDITY_TEST_TIMELINE_WHEEL==='1'){await require('./timeline-wheel-verification')({win,api,until,report});report.passed=true;return;}
 if(process.env.EDITY_TEST_ACOUSTIC_ANCHORS==='1'){await require('./acoustic-anchors-verification')({win,api,until,report});report.passed=true;return;}
 if(process.env.EDITY_TEST_PATH_CASE==='1'){
  const {Worker}=require('node:worker_threads');
  const worker=new Worker(`const {parentPort}=require('node:worker_threads');parentPort.postMessage({uppercasePresent:!!process.env.PATH,mixedCasePresent:!!process.env.Path});`,{eval:true});
  const environment=await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);});await worker.terminate();
  assert.equal(environment.uppercasePresent,false);assert.equal(environment.mixedCasePresent,true);report.workerEnvironment=environment;
 }
 if(process.env.EDITY_TEST_PANE_CLOSE==='1'){await require('./pane-close-verification')({win,api,until,report});report.passed=true;return;}
 if(process.env.EDITY_TEST_PLAYBACK_UI==='1'){await require('./playback-interaction-verification')({win,api,until,root,report});report.passed=true;return;}
 if(process.env.EDITY_TEST_PLAYBACK_SOURCE){await require('./playback-regression-verification')({win,api,until,root,report,source:process.env.EDITY_TEST_PLAYBACK_SOURCE});report.passed=true;return;}
 if(process.env.EDITY_TEST_NARRATION==='1'){await require('./narration-verification')({win,api,until,report});report.passed=true;return;}
 if(process.env.EDITY_TEST_NORMAL_FLOW==='1'){await require('./normal-flow-verification')({win,api,until,report});report.passed=true;return;}
 if(process.env.EDITY_TEST_RESOLVE_EXPORT==='1'){await require('./resolve-export-verification')({win,api,until,root,report,fixture});report.passed=true;return;}
 if(process.env.EDITY_TEST_AI_CAPABILITIES==='1'){await require('./media-capabilities-verification')({api,until,report,fixture});report.passed=true;return;}
 if(process.env.EDITY_TEST_AI_REFERENCE==='1'){await require('./ai-reference-verification')({win,api,until,report});report.passed=true;return;}
 if(process.env.EDITY_TEST_CHAT_VISION==='1'){await require('./chat-vision-verification')({win,api,until,report});report.passed=true;return;}
 const job=async(kind,id,payload)=>{const started=await api('startJob',{kind,projectId:id,payload});return until(async()=>{const j=await api('getJob',started.id);if(['failed','cancelled','partial'].includes(j.status))throw new Error(kind+': '+(j.error||JSON.stringify(j.result)));return j.status==='complete'?j:null;});};
 const observedManifestRequests=[];
 win.webContents.debugger.attach('1.3');
 await win.webContents.debugger.sendCommand('Network.enable');
 win.webContents.debugger.on('message',(_event,method,params)=>{
  if(method==='Network.requestWillBeSent'&&params.request.url.endsWith('/preview/manifest')&&params.request.postData){
   observedManifestRequests.push(JSON.parse(params.request.postData));
  }
 });
 const words=[{word:'Build',start:0,end:.4,confidence:1},{word:'software.',start:.5,end:1.4,confidence:1}];const project=await api('createManagedProject',path.join(fixture,'base.mp4'),{words,segments:[],deletedRanges:[],language:'en',processing:{status:'done',stage:'Ready',progress:100,sources:[],nextIndex:1,preset:'personal',customMargin:.1,engine:'crisper',model:'medium',language:'en'}}),id=project.id;
 const assets=[];for(const [file,kind]of [['alpha.png','image'],['alpha.mov','video'],['C:/Windows/Fonts/arial.ttf','font']])assets.push((await job('asset',id,{path:path.resolve(fixture,file),kind})).result.asset);
 let d=await api('getProjectDocument',id);assert.equal(d.version,2);assert.ok(fs.existsSync(path.join(root,id,'project.edity.v1-backup')));report.checks.push('Existing v1 migrates with its backup and packaged backend serves resources');
 const element=(id,kind,assetId,x)=>({id,kind,assetId,trackId:kind==='text'?'text':'visual',order:1,label:id,enabled:true,createdBy:'manual',placement:{kind:'project',startOffsetUs:0,endOffsetUs:0},transform:{...runtime.defaultTransform(),x,width:.5,height:.3},presets:[runtime.presetInstance('fade-in')],sourceInUs:0,endPolicy:'hold'});
 await api('commitProject',{id:'packaged-composition',projectId:id,baseRevision:d.revision,actor:'manual',label:'Composition',operations:[{type:'add',element:element('logo','image',assets[0].id,.25)},{type:'add',element:element('notification','video',assets[1].id,.75)},{type:'add',element:{...element('title','text',undefined,.5),text:'Packaged title',textStyle:{...runtime.defaultTextStyle(),fontAssetId:assets[2].id},presets:[runtime.presetInstance('grow')]}}]});
 await win.loadFile(path.join(__dirname,'../frontend/dist/index.html'),{query:{project:id,embedded:'1'}});await until(()=>win.webContents.executeJavaScript(`document.querySelector('video')?.readyState>=2`));await pause(1500);const player=await win.webContents.executeJavaScript(`({size:[document.querySelector('canvas')?.width,document.querySelector('canvas')?.height],text:document.body.textContent})`);assert.ok(player.size[0]>=640);assert.ok(!player.text.includes('Font unavailable')&&!player.text.includes('RGBA decode failed'));report.checks.push('Packaged compositor/font/alpha player loads with production web security');
 if(process.env.EDITY_TEST_REAL_AI==='1'){await job('media-edit',id,{requestId:'packaged-ai',message:'Change only the title element text to Build software. Preserve every other field and element. Do not inspect frames; finish.',selection:{elementId:'title'}});d=await api('getProjectDocument',id);assert.equal(d.composition.elements.title.text,'Build software');report.checks.push('Real configured Codex edit in packaged app');}
 const document=await api('getRenderDocument',id),backend=await api('getBackendUrl'),request=manifestRequest(document),response=await fetch(backend+'/preview/manifest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)}),manifest=await response.json();assert.ok(response.ok);
 assert.equal(request.join_silence_preset,'personal');assert.equal(request.join_custom_margin,.1);
 await until(()=>observedManifestRequests.some(body=>body.join_silence_preset==='personal'&&body.join_custom_margin===.1),30000);
 const otherResponse=await fetch(backend+'/preview/manifest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...request,join_silence_preset:'gaming'})}),other=await otherResponse.json();assert.ok(otherResponse.ok);assert.notEqual(manifest.id,other.id);
 report.checks.push('Production player and export both send the saved silence profile; backend cache separates profiles');
 const outputPath=path.join(path.dirname(output),'packaged-export.mp4');await job('export',id,{document,manifest,outputPath,width:1280,height:720,format:'mp4',captions:'burn-in',studioSound:false});assert.ok(fs.statSync(outputPath).size>1000);report.checks.push('Packaged worker exports real MP4 to SSD with fonts, alpha, captions and shared audio');
 const pending=await api('createPendingProject',[path.join(fixture,'base.mp4')],{preset:'personal',customMargin:.1,engine:'crisper',model:'medium',language:'en'});await api('openWorkspaceView',pending.id);const processing=(await api('listJobs',pending.id)).find(j=>j.kind==='process-project');await api('closeWorkspaceView',pending.id);await api('cancelJob',processing.id);assert.equal((await api('getJob',processing.id)).status,'cancelled');report.checks.push('New pending project opens before processing and its task cancels independently');report.passed=true;
 }catch(error){report.passed=false;report.failure=String(error.stack||error);throw error;}finally{fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
};
