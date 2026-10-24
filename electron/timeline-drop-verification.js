// Real OS-backed file drop through Chromium, isolated project and bridge.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({win,api,until,report})=>{
 const root=path.dirname(process.env.EDITY_TEST_REPORT),runtime=require('../shared/composition-runtime.cjs');
 const words=Array.from({length:8},(_,i)=>({word:`word${i}`,start:i,end:i+.8,confidence:1}));
 const project=await api('createManagedProject',path.join(root,'base.mp4'),{title:'Drop media QA',words,segments:[],deletedRanges:[],mediaFolders:{image:'',music:'',broll:''},language:'en'}),id=project.id;
 const ui=code=>win.webContents.executeJavaScript(code,true),pause=ms=>new Promise(r=>setTimeout(r,ms));
 win.webContents.setAudioMuted(true);await win.loadFile(path.join(__dirname,'../frontend/dist/index.html'),{query:{project:id,embedded:'1'}});
 await until(()=>ui(`!!document.querySelector('[data-tracks]')`),45000);
 await ui(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Layers ·')).click()`);
 win.webContents.debugger.attach('1.3');
 const drop=async(files,time,track)=>{
  const point=await ui(`(()=>{const n=document.querySelector('[data-tracks]').parentElement,r=n.getBoundingClientRect(),t=document.querySelector('[data-timeline-track="${track}"]').getBoundingClientRect();return {x:r.left+${time}/8*n.scrollWidth-n.scrollLeft,y:t.top+t.height/2};})()`);
  for(const type of ['dragEnter','dragOver','drop'])await win.webContents.debugger.sendCommand('Input.dispatchDragEvent',{type,x:point.x,y:point.y,data:{items:[],files,dragOperationsMask:1}});
 };
 const overlays=async()=>Object.values((await api('getProjectDocument',id)).composition.elements).filter(e=>e.id!=='base');
 const waitCount=async count=>until(async()=>{const a=await overlays();const error=await ui(`document.querySelector('[data-timeline-import-status]')?.textContent||''`);if(error.includes('Error:'))throw new Error(error);return a.length===count?a:null;},45000);
 const song=path.join(root,'outside-library','Música pròpia.wav');
 await drop([song],1,'music');let elements=await waitCount(1),music=elements[0];
 assert.equal(music.kind,'audio');assert.equal(music.trackId,'music');assert.equal(music.audio.mute,false);assert.ok(Math.abs(music.placement.startUs-1e6)<15000);
 let doc=await api('getProjectDocument',id),asset=doc.composition.assets[music.assetId];assert.equal(asset.status,'ready');assert.ok(fs.existsSync(path.join(process.env.EDITY_TEST_PROJECTS,id,asset.path)));assert.notEqual(asset.path,song);assert.ok(Object.values(doc.mediaFolders).every(v=>!v));
 // Native keyboard history removes only the timeline layer, not the imported resource.
 const key=(keyCode,modifiers)=>{win.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});win.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers});};
 await ui(`document.querySelector('[aria-label="Timeline"]').focus()`);key('Z',['control']);await until(async()=>(await overlays()).length===0,10000);key('Z',['control','shift']);await waitCount(1);
 // The dropped audio uses the same native move/trim gestures, including source phase.
 const gesture=async(selector,dx)=>{
  const p=await ui(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  for(const [type,x] of [['mouseMove',p.x],['mouseDown',p.x],['mouseMove',p.x+dx],['mouseUp',p.x+dx]])win.webContents.sendInputEvent({type,x:Math.round(x),y:Math.round(p.y),modifiers:['shift',...(type==='mouseDown'||type==='mouseMove'?['leftButtonDown']:[])],...(type==='mouseDown'||type==='mouseUp'?{button:'left',clickCount:1}:{})});
  await pause(500);
 };
 await gesture(`[data-element-id="${music.id}"] [aria-label="Trim end"]`,-15);
 let changed=(await overlays()).find(e=>e.id===music.id);assert.ok(changed.placement.endUs<music.placement.endUs-50000);const trimmedEnd=changed.placement.endUs;
 await gesture(`[data-element-id="${music.id}"] [aria-label="Trim start"]`,10);
 changed=(await overlays()).find(e=>e.id===music.id);assert.ok(changed.sourceInUs>50000);const sourceIn=changed.sourceInUs,beforeMove=changed.placement.startUs;
 await gesture(`[data-element-id="${music.id}"]`,12);
 changed=(await overlays()).find(e=>e.id===music.id);assert.ok(changed.placement.startUs>beforeMove+50000);assert.equal(changed.sourceInUs,sourceIn);assert.equal(changed.placement.endUs-changed.placement.startUs,trimmedEnd-beforeMove);
 report.checks.push('Dropped music trims on both edges, updates source-in when trimming start, moves without changing duration/source-in');
 await drop([path.join(root,'overlay.png')],3,'base');await waitCount(2);
 await drop([path.join(root,'base.mp4')],4,'visual');await waitCount(3);
 await drop([song,song],.1,'sound');elements=await waitCount(5);
 const effects=elements.filter(e=>e.trackId==='sound').sort((a,b)=>a.placement.startUs-b.placement.startUs);assert.equal(effects.length,2);assert.equal(effects[1].placement.startUs,effects[0].placement.endUs);assert.equal(effects[0].audio.bus,'sound');
 assert.equal(elements.find(e=>e.kind==='video').audio.mute,true);assert.equal(elements.find(e=>e.kind==='image').trackId,'visual');
 report.checks.push('Native OS-backed WAV/image/video drops at edited time; independent editable layers, muted B-roll, multi-file consecutive sound effects, managed copy outside all media folders, native undo/redo');
 // A zoomed, horizontally scrolled drop uses content coordinates.
 for(let i=0;i<18;i++)await ui(`[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Zoom in').click()`);
 const zoom=await ui(`(()=>{const n=document.querySelector('[data-tracks]').parentElement;n.scrollLeft=n.scrollWidth*.55;return n.scrollWidth/n.clientWidth;})()`);assert.ok(zoom>900);
 await drop([song],4.401,'music');await waitCount(6);
 const zoomMusic=(await overlays()).find(e=>e.kind==='audio'&&Math.abs(e.placement.startUs-4401000)<2000);assert.ok(zoomMusic,'High-zoom position preserved');
 await drop([path.join(root,'unsupported.md')],4.401,'music');await until(()=>ui(`document.querySelector('[data-timeline-import-status]')?.textContent.includes('Drop local audio')`));assert.equal((await overlays()).length,6);
 // Actual external bridge uses the same dispatcher as internal AI, no model call.
 const descriptorFile=fs.readdirSync(process.env.EDITY_AGENT_BRIDGE_DIRECTORY).find(f=>f.endsWith('.json')),descriptor=JSON.parse(fs.readFileSync(path.join(process.env.EDITY_AGENT_BRIDGE_DIRECTORY,descriptorFile),'utf8'));
 const rpc=async(method,params={})=>{const res=await fetch(descriptor.url+'/v1/rpc',{method:'POST',headers:{Authorization:`Bearer ${descriptor.token}`,'Content-Type':'application/json'},body:JSON.stringify({id:'qa',method,params})}),body=await res.json();assert.ok(!body.error,JSON.stringify(body.error));return body.result;};
 const caps=await rpc('capabilities.get',{projectId:id});assert.ok(caps.localMedia.arbitraryLocalFiles);assert.ok(caps.actionTypes.includes('registerLocal'));
 const session=await rpc('sessions.open',{projectId:id,idempotencyKey:'drop-qa-session'});
 const action=async(a)=>{const current=await api('getProjectDocument',id),started=await rpc('actions.execute',{sessionId:session.sessionId,action:a,expectedRevision:current.revision,idempotencyKey:a.id});return until(async()=>{const j=await rpc('jobs.get',{jobId:started.jobId});if(j.status==='failed')throw new Error(j.error);return j.status==='complete'?j:null;},45000);};
 await action({id:'local-song',type:'registerLocal',path:song,kind:'audio'});
 let context=await rpc('context.get',{projectId:id,sessionId:session.sessionId});const candidate=context.candidates.find(c=>c.path===song);assert.ok(candidate);
 const imported=await action({id:'import-song',type:'import',candidateId:candidate.id});assert.ok(imported);
 context=await rpc('context.get',{projectId:id,sessionId:session.sessionId});const importedAsset=context.results.find(r=>r.actionId==='import-song').result.asset;assert.equal(importedAsset.status,'ready');
 const aiMusic={...music,id:'ai-song',createdBy:'ai',assetId:importedAsset.id,placement:{kind:'timeline',startUs:6e6,endUs:7e6},audio:{...music.audio,gainDb:-6,ducking:false}};
 await action({id:'add-song',type:'edit',operations:[{type:'add',element:aiMusic}]});
 doc=await api('getRenderDocument',id);assert.equal(doc.composition.elements['ai-song'].audio.gainDb,-6);
 // Render supplemental audio via the actual shared mix service, verify audible PCM.
 const backend=await api('getBackendUrl'),manifestRes=await fetch(backend+'/preview/manifest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(require('./manifest-request').manifestRequest(doc))}),manifest=await manifestRes.json();assert.ok(manifestRes.ok);
 const plan=runtime.compileComposition(doc.composition,manifest,doc.words),audio=await fetch(backend+'/composition/audio',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan:plan.audio,assets:doc.composition.assets,manifest,voicePath:doc.videoPath,includeVoice:false})}),mixed=await audio.json();assert.ok(audio.ok,JSON.stringify(mixed));
 const {spawnSync}=require('node:child_process'),exe=require('./ffmpeg-paths').locateTool('ffmpeg');
 const pcm=spawnSync(exe,['-v','error','-ss','6.2','-t','0.3','-i',mixed.path,'-f','f32le','-ac','1','pipe:1'],{windowsHide:true});assert.equal(pcm.status,0,pcm.stderr?.toString());let sum=0;for(let n=0;n+4<=pcm.stdout.length;n+=4)sum+=pcm.stdout.readFloatLE(n)**2;const rms=Math.sqrt(sum/(pcm.stdout.length/4));assert.ok(rms>.01,`Music audible RMS=${rms}`);
 const saved=(await api('getProjectDocument',id)).composition;await win.reload();await until(()=>ui(`!!document.querySelector('[data-tracks]')`),45000);assert.deepEqual((await api('getProjectDocument',id)).composition,saved);
 report.timelineDrop={projectId:id,musicStartUs:music.placement.startUs,zoomStartUs:zoomMusic.placement.startUs,overlayCount:(await overlays()).length,rms};
 report.checks.push('1000× scrolled drop precision, rejected nonmedia file, external local register/import/edit shared with internal AI, audible supplemental mix, persisted composition after reopening');
};
