// Isolated packaged QA: transcript seeks must present the destination, not just move audio.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async({win,api,until,report})=>{
 const root=path.dirname(process.env.EDITY_TEST_REPORT),source=process.env.EDITY_TEST_REAL_DOCUMENT;
 const original=JSON.parse(fs.readFileSync(source,'utf8')),clone=structuredClone(original);
 clone.id='qa-seek-project';clone.title='Isolated seek QA';clone.playhead=0;clone.studioSoundEnabled=false;
 for(const asset of Object.values(clone.composition.assets))for(const key of ['path','previewPath','normalizedPath','thumbnailPath'])if(asset[key]&&!path.isAbsolute(asset[key]))asset[key]=path.resolve(path.dirname(source),asset[key]);
 const destination=path.join(process.env.EDITY_TEST_PROJECTS,clone.id);fs.mkdirSync(destination,{recursive:true});fs.writeFileSync(path.join(destination,'project.edity'),JSON.stringify(clone));
 win.webContents.setAudioMuted(true);const ui=code=>win.webContents.executeJavaScript(code,true),pause=ms=>new Promise(r=>setTimeout(r,ms));
 await win.loadFile(path.join(__dirname,'../frontend/dist/index.html'),{query:{project:clone.id,embedded:'1'}});
 await until(()=>ui(`document.querySelector('video')?.readyState>=2&&document.querySelector('video').muted&&document.querySelector('canvas')?.width>=640`),180000);
 await pause(1000);
 await ui(`window.__seekQA={draws:[],events:[],uploads:[],raw:[],delay:0};
 const q=window.__seekQA,video=document.querySelector('video');
 for(const type of ['seeking','seeked','edity-seek','play','pause'])video.addEventListener(type,()=>q.events.push({type,at:performance.now(),time:video.currentTime}));
 const clear=WebGL2RenderingContext.prototype.clear;WebGL2RenderingContext.prototype.clear=function(...a){if(!this.getParameter(this.FRAMEBUFFER_BINDING))q.draws.push({at:performance.now(),time:video.currentTime,seeking:video.seeking,paused:video.paused});return clear.apply(this,a);};
 const upload=WebGL2RenderingContext.prototype.texImage2D;WebGL2RenderingContext.prototype.texImage2D=function(...a){const v=a.at(-1);if(v instanceof HTMLVideoElement)q.uploads.push({at:performance.now(),time:v.currentTime,seeking:v.seeking,base:v===video});return upload.apply(this,a);};
 const originalFetch=window.fetch;window.fetch=async function(...a){if(String(a[0]).endsWith('/composition/frames')){const delay=q.delay;const entry={at:performance.now(),request:JSON.parse(a[1].body),delay};q.raw.push(entry);if(delay)await new Promise(r=>setTimeout(r,delay));const response=await originalFetch.apply(this,a);entry.done=performance.now();return response;}return originalFetch.apply(this,a);};void 0;`);
 async function word(index){
  for(let attempt=0;attempt<45;attempt++){
   const point=await ui(`(()=>{const w=document.querySelector('[data-word-index="${index}"]');if(w){w.scrollIntoView({block:'center'});const r=w.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};}const s=document.querySelector('[data-virtuoso-scroller]'),ws=[...document.querySelectorAll('[data-word-index]')],lo=Number(ws[0]?.dataset.wordIndex||0),hi=Number(ws.at(-1)?.dataset.wordIndex||1);s.scrollTop+=Math.max(-s.clientHeight*4,Math.min(s.clientHeight*4,((${index}-(lo+hi)/2)/(hi-lo+1))*s.clientHeight));return null;})()`);
   if(point){await pause(70);await ui(`document.querySelector('[data-word-index="${index}"]').click()`);return;}
   await pause(100);
  }throw Error('Word not visible: '+index);
 }
 const deleted=new Set(clone.deletedRanges.flatMap(r=>r.wordIndices));
 const targets=[20,544,75,1100,1800,2600,544].map(n=>clone.words.findIndex((w,i)=>i>=n&&!deleted.has(i)));
 report.seeks=[];
 for(const index of targets){
  await ui('document.querySelector("video").pause();window.__seekQA.draws=[];window.__seekQA.events=[];window.__seekQA.uploads=[]');
  await word(index);await pause(1800);
  const result=await ui(`({draws:window.__seekQA.draws,events:window.__seekQA.events,uploads:window.__seekQA.uploads,time:document.querySelector('video').currentTime,error:[...document.querySelectorAll('span')].filter(n=>n.className.includes('orange-300')).map(n=>n.textContent)})`);
  result.index=index;result.expected=clone.words[index].start;
  const seeked=result.events.filter(e=>e.type==='seeked').at(-1);
  result.presentedAfterSeek=!!seeked&&result.draws.some(d=>d.at>=seeked.at&&Math.abs(d.time-result.time)<.15);
  report.seeks.push(result);
 }
 // Reproduce the paused precise-frame request superseded by playback: a slow
 // request must not freeze all subsequent video draws while audio continues.
 const d=await api('getProjectDocument',clone.id),base=d.composition.elements.base;
 await ui('window.__seekQA.delay=5000;window.__seekQA.raw=[]');
 await api('commitProject',{id:'seek-qa-grade',projectId:clone.id,baseRevision:d.revision,actor:'manual',label:'QA precise decode',operations:[{type:'update',id:'base',changes:{colorGrade:{...Object.values(clone.composition.sourceGrades)[0],exposure:.53}}}]});
 await until(()=>ui('window.__seekQA.raw.some(r=>r.delay===5000)'),10000);
 await ui('window.__seekQA.draws=[];document.querySelector("video").play()');await pause(1500);
 report.resumeDuringPreciseSeek=await ui(`({draws:window.__seekQA.draws.length,raw:window.__seekQA.raw,time:document.querySelector('video').currentTime,paused:document.querySelector('video').paused})`);
 await ui('document.querySelector("video").pause();window.__seekQA.delay=0');
 const after=await api('getProjectDocument',clone.id);await api('commitProject',{id:'seek-qa-ungrade',projectId:clone.id,baseRevision:after.revision,actor:'manual',label:'QA restore base',operations:[{type:'update',id:'base',changes:{colorGrade:base.colorGrade||null}}]});await pause(5500);
 // Model a seek whose currentTime is updated while its previous decoded frame
 // remains available. This is permitted by media readyState during seeking.
 await ui(`(()=>{const v=document.querySelector('video'),time=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'currentTime'),seeking=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'seeking');let pending=null;Object.defineProperty(v,'currentTime',{configurable:true,get(){return pending??time.get.call(v);},set(value){pending=value;setTimeout(()=>{time.set.call(v,value);},350);}});Object.defineProperty(v,'seeking',{configurable:true,get(){return pending!==null||seeking.get.call(v);}});v.addEventListener('seeked',()=>{pending=null;},{once:true});window.__seekQA.draws=[];window.__seekQA.events=[];})()`);
 await word(1100);await pause(1400);
 report.delayedNativeSeek=await ui(`({events:window.__seekQA.events,draws:window.__seekQA.draws})`);
 await ui(`delete document.querySelector('video').currentTime;delete document.querySelector('video').seeking`);

 await word(targets.at(-1));await word(75);await word(targets.at(-1));await pause(1800);
 report.final=await ui(`({time:document.querySelector('video').currentTime,error:[...document.querySelectorAll('span')].filter(n=>n.className.includes('orange-300')).map(n=>n.textContent)})`);
 fs.writeFileSync(path.join(root,'seek-final.png'),(await win.webContents.capturePage()).toPNG());
 report.hidden=!win.isVisible();report.unchanged=fs.readFileSync(source,'utf8')===JSON.stringify(original)?true:JSON.stringify(JSON.parse(fs.readFileSync(source,'utf8')))===JSON.stringify(original);
 report.checks.push('Paused transcript seeks across the real project, latest-word recovery, and resume while precise frame decode is delayed');
 const completedSeek=report.delayedNativeSeek.events.filter(e=>e.type==='seeked').at(-1);
 report.recovery={preciseDecode:report.resumeDuringPreciseSeek.draws>=15,nativeFrame:!!completedSeek&&report.delayedNativeSeek.draws.some(d=>d.at>=completedSeek.at)};
 if(process.env.EDITY_TEST_BASELINE==='1')assert.ok(!report.recovery.preciseDecode&&!report.recovery.nativeFrame,'Baseline must reproduce both failures');
 if(process.env.EDITY_TEST_BASELINE!=='1'){
  assert.ok(report.seeks.every(s=>s.presentedAfterSeek),JSON.stringify(report.seeks.map(s=>({index:s.index,presented:s.presentedAfterSeek}))));
  assert.ok(report.resumeDuringPreciseSeek.draws>=15,'Playback must recover without waiting for the delayed precise frame');
  const completed=report.delayedNativeSeek.events.filter(e=>e.type==='seeked').at(-1);assert.ok(completed&&report.delayedNativeSeek.draws.some(d=>d.at>=completed.at),'Destination must be drawn after the native frame arrives');assert.ok(Math.abs(report.final.time-clone.words[targets.at(-1)].start)<.15);assert.deepEqual(report.final.error,[]);assert.ok(report.unchanged);
 }
};
