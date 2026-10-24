// Opt-in, isolated packaged UI/bridge QA. Never uses the desktop project library.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async({win,api,until,report})=>{
  const root=path.dirname(process.env.EDITY_TEST_REPORT),runtime=require('../shared/composition-runtime.cjs');
  win.webContents.setAudioMuted(true);
  const words=['Alpha','Beta','Gamma'].map((word,i)=>({word,start:i*2,end:(i+1)*2,confidence:1}));
  const project=await api('createManagedProject',path.join(root,'base.mp4'),{
    title:'Narration v17 isolated QA',words,segments:[{id:0,start:0,end:6,text:'Alpha Beta Gamma',words}],
    deletedRanges:[],language:'en',processing:{status:'done',stage:'Ready',progress:100,sources:[],nextIndex:1,
      preset:'personal',customMargin:.1,engine:'crisper',model:'small',language:'en'}});
  await api('openWorkspaceView',project.id);win.webContents.send('workspace:openProject',project.id);
  const editor=await until(()=>win.getBrowserViews().find(v=>new URL(v.webContents.getURL()).searchParams.get('project')===project.id),15000);
  editor.webContents.setAudioMuted(true);
  const ui=code=>editor.webContents.executeJavaScript(code,true);
  await until(()=>ui(`document.querySelector('video')?.readyState>=2&&document.querySelector('[data-word-index="2"]')`),30000);
  const descriptorFile=fs.readdirSync(process.env.EDITY_AGENT_BRIDGE_DIRECTORY).find(f=>f.endsWith('.json'));
  const descriptor=JSON.parse(fs.readFileSync(path.join(process.env.EDITY_AGENT_BRIDGE_DIRECTORY,descriptorFile),'utf8'));
  let request=0;
  const rpc=async(method,params={},allowError=false)=>{
    const response=await fetch(descriptor.url+'/v1/rpc',{method:'POST',headers:{Authorization:`Bearer ${descriptor.token}`,'Content-Type':'application/json'},body:JSON.stringify({id:`qa-${++request}`,method,params})});
    const body=await response.json();if(!allowError)assert.ok(!body.error,JSON.stringify(body.error));return allowError?body:body.result;
  };
  assert.equal((await rpc('capabilities.get')).workflow.passageReordering,true);
  const assetJob=await api('startJob',{kind:'asset',projectId:project.id,payload:{path:path.join(root,'magenta.png'),kind:'image'}});
  const asset=await until(async()=>{const j=await api('getJob',assetJob.id);if(j.status==='failed')throw Error(j.error);return j.status==='complete'?j.result.asset:null;},30000);
  let d=await api('getProjectDocument',project.id);const originalWords=structuredClone(d.words),ids=d.words.map(w=>w.id);
  const placement={kind:'speech',startWordId:ids[1],endWordId:ids[1],memberWordIds:[ids[1]],startOffsetUs:0,endOffsetUs:0,fallbackClock:'clip-local',fallback:{clipId:d.clips[0].id,startUs:2000000,endUs:4000000}};
  const common={enabled:true,createdBy:'manual',placement,transform:runtime.defaultTransform(),presets:[],sourceInUs:0,endPolicy:'hold',order:1};
  await api('commitProject',{id:'qa-linked-beta',projectId:project.id,baseRevision:d.revision,actor:'manual',label:'Bind Beta visuals',operations:[
    {type:'add',element:{...common,id:'beta-broll',label:'Beta B-roll',trackId:'visual',kind:'image',assetId:asset.id}},
    {type:'add',element:{...common,id:'beta-text',label:'Beta text',trackId:'text',kind:'text',text:'Beta follows speech',textStyle:{...runtime.defaultTextStyle(),fontSize:64},transform:{...runtime.defaultTransform(),y:.85,width:.8,height:.15}}}
  ]});
  const state=async()=>{
    const document=await api('getRenderDocument',project.id),backend=await api('getBackendUrl');
    const response=await fetch(backend+'/preview/manifest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(require('./manifest-request').manifestRequest(document))});
    assert.ok(response.ok);const manifest=await response.json(),plan=runtime.compileComposition(document.composition,manifest,document.words);
    return {document,manifest,plan,anchor:plan.elements.find(e=>e.id==='beta-broll')};
  };
  const order=async()=>ui(`Array.from(document.querySelectorAll('[data-word-index]')).map(n=>Number(n.dataset.wordIndex))`);
  const select=async(index,shift=false)=>ui(`(()=>{const n=document.querySelector('[data-word-index="${index}"]');n.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,shiftKey:${shift}}));n.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));})()`);
  const key=async(letter)=>ui(`document.body.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(letter)},ctrlKey:true,bubbles:true,cancelable:true}))`);
  const colorOK=(p,color)=>color==='magenta'?p[0]>190&&p[2]>190&&p[1]<45:color==='red'?p[0]>190&&p[1]<45&&p[2]<45:p[1]>90&&p[0]<45&&p[2]<45;
  const capture=async(label,wordIndex,color)=>{
    const s=await state();await select(wordIndex);await ui(`document.querySelector('[data-word-index="${wordIndex}"]').click()`);
    const phase=(report.cases?.length||0)+1,stamp=[17*phase,31*phase,43*phase];
    // A changed corner marker proves the native bitmap belongs to this DOM
    // presentation, even when consecutive stages share the same canvas color.
    await ui(`new Promise(resolve=>{let n=document.getElementById('qa-paint-phase');if(!n){n=document.createElement('div');n.id='qa-paint-phase';document.body.appendChild(n);}n.style.cssText='position:fixed;top:0;right:0;width:12px;height:12px;z-index:999999;background:rgb(${stamp.join(',')})';requestAnimationFrame(()=>requestAnimationFrame(resolve));})`);
    const rect=await ui(`(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:innerWidth,h:innerHeight};})()`);
    let native,pixel;
    await until(async()=>{native=await editor.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});const size=native.getSize(),data=native.toBitmap(),i=(Math.floor(rect.y*size.height/rect.h)*size.width+Math.floor(rect.x*size.width/rect.w))*4;pixel=Array.from(data.subarray(i,i+4));const corner=(Math.floor(5*size.height/rect.h)*size.width+Math.floor((rect.w-5)*size.width/rect.w))*4,seen=Array.from(data.subarray(corner,corner+3)).reverse();return colorOK(pixel,color)&&seen.every((v,k)=>Math.abs(v-stamp[k])<3);},30000);
    fs.writeFileSync(path.join(root,label+'-editor.png'),native.toPNG());
    const word=s.document.words[wordIndex],at=runtime.sourceToEdit(s.manifest,Math.round((word.start+word.end)*500000));assert.notEqual(at,null);
    await require('./render-worker-manager').exportComposition({plan:s.plan,outputPath:path.join(root,label+'.png'),width:320,height:180,capture:true,atUs:at}).result;
    report.cases=[...(report.cases||[]),{label,wordIndex,timeUs:at,nativePixel:pixel,anchor:{startUs:s.anchor.startUs,endUs:s.anchor.endUs,suppressed:s.anchor.suppressed}}];
    assert.equal(win.isVisible(),false);return s;
  };
  await capture('before-beta',1,'magenta');
  await select(2);await ui(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Move to beginning').click()`);
  await until(async()=>JSON.stringify(await order())==='[2,0,1]',15000);
  let moved=await capture('moved-gamma',2,'green');assert.deepEqual(moved.document.words,originalWords);assert.equal(moved.anchor.startUs,4000000);assert.equal(moved.manifest.durationUs,6000000);
  await select(2);await select(0,true);await ui(`document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true,cancelable:true}))`);
  await until(async()=>{const n=await api('getProjectDocument',project.id);return n.deletedRanges.flatMap(r=>r.wordIndices).length===2;},15000);
  d=await api('getProjectDocument',project.id);assert.deepEqual(d.deletedRanges.flatMap(r=>r.wordIndices).sort(),[0,2]);
  await capture('deleted-neighbors-beta-stays',1,'magenta');
  await key('z');await until(async()=>!(await api('getProjectDocument',project.id)).deletedRanges.length,15000);
  report.checks.push('Displayed noncontiguous original-index selection deletes exactly its own words, without foreign Beta');
  await select(1);await key('x');await until(async()=>(await api('getProjectDocument',project.id)).narration?.cutClipboard.length,15000);
  const parked=await state();assert.equal(parked.anchor.suppressed,true);assert.equal(parked.manifest.durationUs,4000000);
  await select(0);await key('v');await until(async()=>JSON.stringify(await order())==='[2,1,0]',15000);
  const pasted=await capture('pasted-beta',1,'magenta');assert.deepEqual(pasted.document.words,originalWords);assert.equal(pasted.anchor.startUs,2000000);assert.equal(pasted.manifest.durationUs,6000000);
  const copy=await rpc('narration.copyText',{projectId:project.id,wordIds:[ids[1]]});assert.equal(copy.text,'Beta');
  const failedPaste=await rpc('narration.paste',{projectId:project.id,expectedRevision:pasted.document.revision,idempotencyKey:'qa-empty-paste',position:'end'},true);assert.ok(failedPaste.error);
  assert.equal((await api('getProjectDocument',project.id)).revision,pasted.document.revision);
  const stale=await rpc('narration.move',{projectId:project.id,expectedRevision:0,idempotencyKey:'qa-stale-move',wordIds:[ids[0]],position:'start'},true);assert.ok(stale.error);
  await select(2);await ui(`document.querySelector('[data-word-index="2"]').click()`);
  await until(()=>ui(`document.querySelector('video').loop===true&&document.querySelector('video').muted===true`),30000);
  await ui(`window.__qaAudio=[];const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){window.__qaAudio.push(args);return start.apply(this,args);};void 0;`);
  const playStarted=Date.now();report.beforePlayback=await ui(`({time:document.querySelector('video').currentTime,seeking:document.querySelector('video').seeking,text:document.body.textContent.slice(-280)})`);await ui(`document.querySelector('video').play()`);
  await new Promise(r=>setTimeout(r,2600));
  const playback=await ui(`({paused:document.querySelector('video').paused,sourceTime:document.querySelector('video').currentTime,loop:document.querySelector('video').loop,seeking:document.querySelector('video').seeking,audio:window.__qaAudio,text:document.body.textContent.slice(-280)})`);
  report.eofPlaybackDebug=playback;
  assert.equal(playback.paused,false);assert.ok(playback.sourceTime>2.1&&playback.sourceTime<3.5,JSON.stringify(playback));
  await ui(`document.querySelector('video').pause()`);report.eofPlayback={elapsedMs:Date.now()-playStarted,...playback};
  const frozen=await rpc('exports.prepare',{projectId:project.id,expectedRevision:pasted.document.revision,idempotencyKey:'qa-freeze-reordered'});
  const output=path.join(root,'reordered.mp4'),exported=await rpc('exports.start',{snapshotId:frozen.snapshotId,idempotencyKey:'qa-export-reordered',outputPath:output,width:320,height:180,format:'mp4'});
  await until(async()=>{const j=await rpc('jobs.get',{jobId:exported.jobId});if(j.status==='failed')throw Error(j.error);return j.status==='complete';},180000);
  const resolve=await rpc('exports.start',{snapshotId:frozen.snapshotId,idempotencyKey:'qa-resolve-reordered',kind:'resolve',outputPath:path.join(root,'reordered.fcpxml'),width:320,height:180});
  await until(async()=>{const j=await rpc('jobs.get',{jobId:resolve.jobId});if(j.status==='failed')throw Error(j.error);return j.status==='complete';},180000);
  await key('z');await until(async()=>(await state()).anchor.suppressed,15000);
  await key('z');await until(async()=>JSON.stringify(await order())==='[2,0,1]',15000);await capture('undo-beta-restored',1,'magenta');
  await key('z');await until(async()=>JSON.stringify(await order())==='[0,1,2]',15000);
  const restored=await state();assert.deepEqual(restored.document.words,originalWords);assert.deepEqual(restored.document.composition.elements['beta-broll'].placement.memberWordIds,[ids[1]]);
  const gapWords=[{word:'Alpha',start:0,end:.9,confidence:1},{word:'Beta',start:2,end:4,confidence:1},{word:'Gamma',start:4,end:6,confidence:1}];
  const gapProject=await api('createManagedProject',path.join(root,'base.mp4'),{title:'Verified voiced gap QA',words:gapWords,segments:[{id:0,start:0,end:6,text:'Alpha Beta Gamma',words:gapWords}],deletedRanges:[],language:'en',processing:{status:'done',stage:'Ready',progress:100,sources:[],nextIndex:1,preset:'personal',customMargin:.1,engine:'crisper',model:'small',language:'en'}});
  await rpc('projects.open',{projectId:gapProject.id,show:false});
  await until(async()=>Object.values((await api('getProjectDocument',gapProject.id)).composition.assets).some(a=>a.durationUs>=6000000),30000);
  let gap=await rpc('context.get',{projectId:gapProject.id,wordLimit:3,includeManifest:false});
  const gapSession=await rpc('sessions.open',{projectId:gapProject.id,idempotencyKey:'qa-gap-session'});
  const gapCut=await rpc('actions.execute',{sessionId:gapSession.sessionId,expectedRevision:gap.revision,idempotencyKey:'qa-protect-voiced-gap',action:{id:'protect-voiced-gap',type:'edit',deleteRanges:[{startIndex:1,endIndex:1,cutStartUs:2000000,cutEndUs:4000000}]}});
  await until(async()=>{const j=await rpc('jobs.get',{jobId:gapCut.jobId});if(j.status==='failed')throw Error(j.error);return j.status==='complete';},30000);
  gap=await rpc('context.get',{projectId:gapProject.id,wordLimit:3,includeManifest:true});assert.equal(gap.manifest.durationUs,4000000);assert.equal(gap.deletedRanges[0].cutStart,2);assert.equal(gap.deletedRanges[0].cutEnd,4);
  const gapSnapshot=await rpc('exports.prepare',{projectId:gapProject.id,expectedRevision:gap.revision,idempotencyKey:'qa-gap-freeze'});
  const gapExport=await rpc('exports.start',{snapshotId:gapSnapshot.snapshotId,idempotencyKey:'qa-gap-export',outputPath:path.join(root,'voiced-gap.mp4'),width:320,height:180});
  await until(async()=>{const j=await rpc('jobs.get',{jobId:gapExport.jobId});if(j.status==='failed')throw Error(j.error);return j.status==='complete';},180000);
  const invalid=await rpc('actions.execute',{sessionId:gapSession.sessionId,expectedRevision:gap.revision,idempotencyKey:'qa-invalid-gap-bound',action:{id:'invalid-gap-bound',type:'edit',cutBoundaries:[{rangeId:gap.deletedRanges[0].id,cutStartUs:7000000}]}},true);
  if(!invalid.error)await until(async()=>{const j=await rpc('jobs.get',{jobId:invalid.result.jobId});return j.status==='failed';},30000);
  assert.equal((await rpc('context.get',{projectId:gapProject.id,wordLimit:1,includeManifest:false})).revision,gap.revision);
  await rpc('history.undo',{projectId:gapProject.id,expectedRevision:gap.revision,idempotencyKey:'qa-gap-undo'});assert.equal((await rpc('context.get',{projectId:gapProject.id,wordLimit:1,includeManifest:false})).deletedIndices.length,0);
  report.gapBoundaries={projectId:gapProject.id,sourceStartUs:2000000,sourceEndUs:4000000,retainedDurationUs:4000000,invalidRejected:true,undoRestored:true};
  report.projectId=project.id;report.outputPath=output;report.originalWordIds=ids;
  report.checks.push('Real hidden UI move/Ctrl-X/Ctrl-V/undo, one-use clipboard, stable ASR identities, linked visual movement, AAC preview past native EOF and ordered video/Resolve export');
};
