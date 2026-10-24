// Opt-in hidden QA. All documents/media belong to EDITY_TEST_PROJECTS.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async({win,api,until,report})=>{
 if(process.env.EDITY_TEST_REAL_DOCUMENT)return verifyReal({win,api,until,report});
 const root=path.dirname(process.env.EDITY_TEST_REPORT),runtime=require('../shared/composition-runtime.cjs');
 win.webContents.setAudioMuted(true);
 const words=['Alpha','Beta','Gamma','Delta','Epsilon','Zeta','Eta','Theta'].map((word,i)=>({word,start:i,end:i+.9,confidence:1}));
 const project=await api('createManagedProject',path.join(root,'base.mp4'),{title:'Playback interaction QA',words,segments:[{id:0,start:0,end:8,text:words.map(w=>w.word).join(' '),words}],deletedRanges:[{id:'qa-cut',start:2.9,end:3,wordIndices:[]}],language:'en',processing:{status:'done',stage:'Ready',progress:100,sources:[],nextIndex:1,preset:'personal',customMargin:.1,engine:'crisper',model:'small',language:'en'}});
 await win.loadFile(path.join(__dirname,'../frontend/dist/index.html'),{query:{project:project.id,embedded:'1'}});
 const ui=code=>win.webContents.executeJavaScript(code,true);
 await until(()=>ui(`document.querySelector('video')?.readyState>=2&&!!document.querySelector('[data-word-index="6"]')`),30000);
 const job=await api('startJob',{kind:'asset',projectId:project.id,payload:{path:path.join(root,'broll.mp4'),kind:'video'}});
 const asset=await until(async()=>{const j=await api('getJob',job.id);if(j.status==='failed')throw Error(j.error);return j.status==='complete'?j.result.asset:null;},30000);
 const d=await api('getProjectDocument',project.id);
 await api('commitProject',{id:'qa-broll',projectId:project.id,baseRevision:d.revision,actor:'manual',label:'QA B-roll',operations:[{type:'add',element:{id:'moving-broll',kind:'video',assetId:asset.id,trackId:'visual',order:1,label:'Moving B-roll',enabled:true,createdBy:'manual',placement:{kind:'project',startOffsetUs:0,endOffsetUs:0},transform:runtime.defaultTransform(),presets:[],sourceInUs:0,endPolicy:'loop'}}]});
 await until(()=>ui(`document.querySelector('canvas')?.width>=640`),30000);
 await ui(`window.__qaPlayback={seekEvents:[],draws:[],videoSeeks:[]};document.querySelector('video').addEventListener('edity-seek',()=>window.__qaPlayback.seekEvents.push(performance.now()));const draw=WebGL2RenderingContext.prototype.drawArrays;WebGL2RenderingContext.prototype.drawArrays=function(...args){window.__qaPlayback.draws.push(performance.now());return draw.apply(this,args);};const descriptor=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'currentTime');Object.defineProperty(HTMLMediaElement.prototype,'currentTime',{...descriptor,set(value){window.__qaPlayback.videoSeeks.push({at:performance.now(),value,base:this===document.querySelector('video')});descriptor.set.call(this,value);}});void 0;`);
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const coords=async index=>ui(`(()=>{const r=document.querySelector('[data-word-index="${index}"]').getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
 const mouse=async(type,index,extra={})=>win.webContents.sendInputEvent({type,...await coords(index),...extra});
 report.wordClicks=[];
 for(const index of [6,1,5]){
  await mouse('mouseMove',index);await pause(60);await mouse('mouseDown',index,{button:'left',clickCount:1});await pause(90);await mouse('mouseUp',index,{button:'left',clickCount:1});await pause(250);
  report.wordClicks.push({index,...await ui(`({time:document.querySelector('video').currentTime,events:window.__qaPlayback.seekEvents.length})`)});
 }
 await ui(`document.querySelector('[data-word-index="0"]').click();window.__qaPlayback.draws=[];window.__qaPlayback.videoSeeks=[];document.querySelector('video').play()`);
 await pause(3600);
 report.playback=await ui(`(()=>{document.querySelector('video').pause();const p=window.__qaPlayback,t=p.draws,dt=t.length>1?t.at(-1)-t[0]:0;return{paused:document.querySelector('video').paused,time:document.querySelector('video').currentTime,drawCount:t.length,drawFps:dt?t.length*1000/dt:0,overlaySeeks:p.videoSeeks.filter(s=>!s.base).length,baseSeeks:p.videoSeeks.filter(s=>s.base).length,text:document.body.textContent.slice(-600)};})()`);
 await ui(`document.querySelector('video').play()`);await pause(120);
 await mouse('mouseMove',6);await mouse('mouseDown',6,{button:'left',clickCount:1});await pause(60);await mouse('mouseUp',6,{button:'left',clickCount:1});await pause(150);
 report.playingClick=await ui(`({time:document.querySelector('video').currentTime,paused:document.querySelector('video').paused})`);
 await ui(`document.querySelector('video').pause()`);const before=await ui(`window.__qaPlayback.seekEvents.length`);
 await mouse('mouseMove',1);await mouse('mouseDown',1,{button:'left',clickCount:1});await pause(50);
 await mouse('mouseMove',3,{modifiers:['leftButtonDown']});await pause(50);await mouse('mouseUp',3,{button:'left',clickCount:1});await pause(100);
 report.drag=await ui(`({events:window.__qaPlayback.seekEvents.length,selected:Array.from(document.querySelectorAll('[data-word-index]')).filter(w=>w.className.includes('bg-editor-word-selected')).map(w=>Number(w.dataset.wordIndex))})`);
 assert.equal(report.drag.events,before,'Dragging selects words without seeking');assert.deepEqual(report.drag.selected,[1,2,3]);
 assert.equal(report.playingClick.paused,false);assert.ok(Math.abs(report.playingClick.time-6)<.4,JSON.stringify(report.playingClick));
 report.hidden=!win.isVisible();report.projectId=project.id;
 // Baseline mode records failures without making the measurement incomplete.
 report.interactionsPassed=report.wordClicks.every(c=>Math.abs(c.time-c.index)<.15&&c.events>0);
 report.checks.push('Physical mouse down/up word clicks and moving B-roll cadence measured in packaged hidden app');
 if(process.env.EDITY_TEST_BASELINE!=='1')assert.ok(report.interactionsPassed,JSON.stringify(report.wordClicks));
};
async function verifyReal({win,api,until,report}){
 const root=path.dirname(process.env.EDITY_TEST_REPORT),source=process.env.EDITY_TEST_REAL_DOCUMENT,sourceDirectory=path.dirname(source),original=JSON.parse(fs.readFileSync(source,'utf8'));
 const clone=structuredClone(original);clone.id='qa-real-project';clone.title='QA isolated · '+clone.title;clone.playhead=0;clone.studioSoundEnabled=false;
 const destination=path.join(process.env.EDITY_TEST_PROJECTS,clone.id);fs.mkdirSync(destination,{recursive:true});
 const reference=process.env.EDITY_TEST_REFERENCE_MEDIA==='1';
 const video=reference?clone.videoPath:path.join(destination,'qa-source.mp4');if(!reference)fs.copyFileSync(clone.videoPath,video);clone.videoPath=video;
 const previous=path.join('D:/Edity-media-verification/playback-v18-real-baseline-20261017/projects/qa-real-project','qa-source');
 if(!reference&&process.env.EDITY_TEST_BASELINE!=='1'&&fs.existsSync(previous+'.edity-audio.wav')){
  fs.copyFileSync(previous+'.edity-audio.wav',path.join(destination,'qa-source.edity-audio.wav'));
  const stat=fs.statSync(video,{bigint:true});fs.writeFileSync(path.join(destination,'qa-source.edity-audio.json'),`{"source":${JSON.stringify(path.resolve(video))},"size":${stat.size},"mtime_ns":${stat.mtimeNs},"version":2}`);
 }
 const originalPreview=original.videoPath.replace(/\.[^.]+$/,'.edity-preview.mp4');
 if(!reference&&fs.existsSync(originalPreview)){
  fs.copyFileSync(originalPreview,path.join(destination,'qa-source.edity-preview.mp4'));
  const stat=fs.statSync(video,{bigint:true});fs.writeFileSync(path.join(destination,'qa-source.edity-preview.json'),`{"size":${stat.size},"mtime_ns":${stat.mtimeNs}}`);
 }
 for(const asset of Object.values(clone.composition.assets))for(const key of ['path','previewPath','normalizedPath','thumbnailPath'])if(asset[key]&&!path.isAbsolute(asset[key]))asset[key]=path.resolve(sourceDirectory,asset[key]);
 fs.writeFileSync(path.join(destination,'project.edity'),JSON.stringify(clone));
 win.webContents.setAudioMuted(true);const ui=code=>win.webContents.executeJavaScript(code,true);
 await win.loadFile(path.join(__dirname,'../frontend/dist/index.html'),{query:{project:clone.id,embedded:'1'}});
 await until(()=>ui(`document.querySelector('video')?.readyState>=2&&document.querySelector('video').muted`),180000);
 if(process.env.EDITY_TEST_INTRO==='1'){
  win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Profiler.enable');await win.webContents.debugger.sendCommand('Profiler.start');
  await ui(`window.__seeks=[];const prop=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'currentTime');Object.defineProperty(HTMLMediaElement.prototype,'currentTime',{...prop,set(value){window.__seeks.push({at:performance.now(),value,src:this.currentSrc});prop.set.call(this,value);}});void 0;`);
  await ui(`window.__intro={uploads:[],videos:new Map(),next:0};const original=WebGL2RenderingContext.prototype.texImage2D;WebGL2RenderingContext.prototype.texImage2D=function(...args){const frame=args.at(-1),q=window.__intro;if(frame instanceof HTMLVideoElement){if(!q.videos.has(frame))q.videos.set(frame,++q.next);q.uploads.push({at:performance.now(),id:q.videos.get(frame),time:frame.currentTime,decoded:frame.getVideoPlaybackQuality().totalVideoFrames,seeking:frame.seeking,src:frame.currentSrc});}return original.apply(this,args);};void 0;`);
  await until(()=>ui(`!!document.querySelector('[data-word-index="20"]')`),30000);
  await ui(`document.querySelector('[data-word-index="20"]').click();document.querySelector('video').play()`);
  await new Promise(r=>setTimeout(r,14000));
  const data=await ui(`(()=>{document.querySelector('video').pause();return window.__intro.uploads;})()`);
  fs.writeFileSync(path.join(root,'intro-profile.json'),JSON.stringify((await win.webContents.debugger.sendCommand('Profiler.stop')).profile));
  fs.writeFileSync(path.join(root,'intro-seeks.json'),JSON.stringify(await ui('window.__seeks')));
  fs.writeFileSync(path.join(root,'intro-uploads.json'),JSON.stringify(data));
  report.intro=Object.entries(Object.groupBy(data,x=>x.id)).map(([id,entries])=>{
    let last=-1,moving=[];for(const e of entries)if(e.decoded!==last){moving.push(e.at);last=e.decoded;}
    const gaps=moving.slice(1).map((t,i)=>t-moving[i]).sort((a,b)=>a-b);
    return {id,src:entries[0].src.split('path=')[1],uploads:entries.length,decodedChanges:moving.length,maxGapMs:gaps.at(-1)||0,p95GapMs:gaps[Math.floor(gaps.length*.95)]||0};
  });
  report.silenceMarkers=await ui(`document.querySelectorAll('[data-silence-cut]').length`);
  const document=await api('getRenderDocument',clone.id),backend=await api('getBackendUrl');
  const response=await fetch(backend+'/preview/manifest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(require('./manifest-request').manifestRequest(document))});
  const manifest=await response.json();assert.ok(response.ok);report.firstKeptSourceSecond=manifest.keepSegments[0].start;
  assert.ok(report.firstKeptSourceSecond>=6.4&&report.firstKeptSourceSecond<6.47,'Prefix cut must exclude No while preserving So');
  assert.ok(report.silenceMarkers>0);
  report.checks.push('14 seconds of the actual intro measured across A-roll and successive B-roll decoders');report.passed=true;return;
 }
 await ui(`window.__qa={events:0,frames:0,mouse:[]};document.querySelector('video').addEventListener('edity-seek',()=>window.__qa.events++);for(const event of ['mousedown','mouseup','click'])document.addEventListener(event,e=>window.__qa.mouse.push({type:event,word:e.target.closest('[data-word-index]')?.dataset.wordIndex,x:e.clientX,y:e.clientY}),true);const clear=WebGL2RenderingContext.prototype.clear;WebGL2RenderingContext.prototype.clear=function(...args){window.__qa.frames++;return clear.apply(this,args);};void 0;`);
 report.wordClicks=[];const deleted=new Set(clone.deletedRanges.flatMap(r=>r.wordIndices));
 const indexes=[20,35,75].map(n=>clone.words.findIndex((w,i)=>i>=n&&!deleted.has(i)));
 for(const index of indexes){
  await until(()=>ui(`!!document.querySelector('[data-word-index="${index}"]')`),20000);
  const point=await ui(`(()=>{const r=document.querySelector('[data-word-index="${index}"]').getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
  win.webContents.sendInputEvent({type:'mouseMove',...point});await new Promise(r=>setTimeout(r,60));
  win.webContents.sendInputEvent({type:'mouseDown',...point,button:'left',clickCount:1});await new Promise(r=>setTimeout(r,80));
  win.webContents.sendInputEvent({type:'mouseUp',...point,button:'left',clickCount:1});await new Promise(r=>setTimeout(r,350));
  report.wordClicks.push({index,expected:clone.words[index].start,...await ui(`({time:document.querySelector('video').currentTime,events:window.__qa.events})`)});
 }
 await ui(`document.querySelector('[data-word-index="35"]').click();document.querySelector('video').play()`);
 await new Promise(r=>setTimeout(r,2500));
 win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Profiler.enable');await win.webContents.debugger.sendCommand('Profiler.start');
 await ui(`window.__qa.frames=0;window.__qa.start=performance.now()`);
 await new Promise(r=>setTimeout(r,4000));
 report.playback=await ui(`(()=>{document.querySelector('video').pause();const q=window.__qa;return{frames:q.frames,fps:q.frames*1000/(performance.now()-q.start),time:document.querySelector('video').currentTime,mouse:q.mouse};})()`);
 const profile=(await win.webContents.debugger.sendCommand('Profiler.stop')).profile;fs.writeFileSync(path.join(root,'profile.json'),JSON.stringify(profile));
 const samples=new Map();for(const id of profile.samples||[])samples.set(id,(samples.get(id)||0)+1);
 report.profile=profile.nodes.map(n=>({name:n.callFrame.functionName,line:n.callFrame.lineNumber,column:n.callFrame.columnNumber,samples:samples.get(n.id)||0})).sort((a,b)=>b.samples-a.samples).slice(0,12);
 report.projectWords=clone.words.length;report.projectElements=Object.keys(clone.composition.elements).length;report.hidden=!win.isVisible();
 report.interactionsPassed=report.wordClicks.every(c=>Math.abs(c.time-c.expected)<.15&&c.events>0);
 report.checks.push('Actual project metadata is copied into isolated storage; physical word clicks exercise full transcript and composition');
 if(process.env.EDITY_TEST_BASELINE!=='1')assert.ok(report.interactionsPassed,JSON.stringify(report.wordClicks));
}
