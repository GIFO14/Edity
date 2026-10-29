// Hidden, isolated playback of two base source handles. Exports use the normal pipelines.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async({win,api,until,report})=>{
 const root=path.dirname(process.env.EDITY_TEST_REPORT),runtime=require('../shared/composition-runtime.cjs');
 const baseline=process.env.EDITY_TEST_TRANSITION_BASELINE==='1',ui=code=>win.webContents.executeJavaScript(code,true),pause=ms=>new Promise(r=>setTimeout(r,ms));
 const words=Array.from({length:10},(_,i)=>({word:'Word'+i,start:i,end:i+.8,confidence:1}));
 const project=await api('createManagedProject',path.join(root,'base.mp4'),{title:'Base transition playback QA',words,segments:[{id:0,start:0,end:10,text:words.map(w=>w.word).join(' '),words}],deletedRanges:[{id:'middle',start:2,end:4,wordIndices:[2,3],cutStart:2,cutEnd:4}],language:'es'}),id=project.id;
 let d=await api('getProjectDocument',id);
 await api('commitProject',{id:'add-base-transition',projectId:id,baseRevision:d.revision,actor:'manual',label:'Transition QA',operations:[{type:'canvas',canvas:{...d.composition.canvas,fps:{num:60,den:1}}},{type:'transition',transition:{id:'base-zoom',fromId:'base',toId:'base',atUs:2e6,durationUs:500000,alignment:'center',preset:{presetId:'Xir_Zoom_v4',presetVersion:1,params:{strength:1,blur:1}}}}]});
 win.webContents.setAudioMuted(true);
 await win.loadFile(path.join(__dirname,'../frontend/dist/index.html'),{query:{project:id,embedded:'1'}});
 await until(()=>ui(`document.querySelector('video')?.readyState>=2&&document.querySelector('canvas')?.width>=640&&!!document.querySelector('[data-word-index="1"]')`),45000);
 const sampleCode=`(()=>{const c=document.querySelector('canvas'),s=document.createElement('canvas');s.width=s.height=8;const x=s.getContext('2d',{willReadFrequently:true});x.drawImage(c,0,0,8,8);const a=x.getImageData(0,0,8,8).data;let r=0,g=0,b=0,h=2166136261;for(let i=0;i<a.length;i+=4){r+=a[i];g+=a[i+1];b+=a[i+2];h=Math.imul(h^a[i],16777619);h=Math.imul(h^a[i+1],16777619);h=Math.imul(h^a[i+2],16777619);}return{r:r/64,g:g/64,b:b/64,hash:h};})()`;
 await until(async()=>{const s=await ui(sampleCode);return s.r+s.g+s.b>50;},30000);
 const session=win.webContents.session;
 // Bounded media latency makes cold decoder readiness reproducible, without
 // changing any frame data or the renderer. It also stresses a direct seek.
 const backend=await api('getBackendUrl');session.webRequest.onBeforeRequest({urls:[backend+'/file*']},(_details,callback)=>setTimeout(()=>callback({cancel:false}),120));
 try{
  await ui(`window.__transitionCapture={frames:[],stop:false,bad:null,mix:null};(()=>{const state=window.__transitionCapture,c=document.querySelector('canvas'),s=document.createElement('canvas');s.width=s.height=8;const x=s.getContext('2d',{willReadFrequently:true});const tick=()=>{if(state.stop)return;const v=document.querySelector('video'),time=Number(document.querySelector('[aria-label="Playhead"]')?.getAttribute('aria-valuenow')||0);if(!v.paused&&time>=1.45&&time<=2.45){x.drawImage(c,0,0,8,8);const a=x.getImageData(0,0,8,8).data;let r=0,g=0,b=0,h=2166136261;for(let i=0;i<a.length;i+=4){r+=a[i];g+=a[i+1];b+=a[i+2];h=Math.imul(h^a[i],16777619);h=Math.imul(h^a[i+1],16777619);h=Math.imul(h^a[i+2],16777619);}r/=64;g/=64;b/=64;state.frames.push({time,r,g,b,hash:h});if(r+g+b<15&&!state.bad)state.bad=c.toDataURL();if(r>65&&g>65&&b>65&&!state.mix)state.mix=c.toDataURL();}requestAnimationFrame(tick);};requestAnimationFrame(tick);})();document.querySelector('[data-word-index="1"]').click();document.querySelector('video').play();void 0;`);
  await until(()=>ui(`Number(document.querySelector('[aria-label="Playhead"]')?.getAttribute('aria-valuenow'))>2.6`),20000);
  const first=await ui(`(()=>{document.querySelector('video').pause();const q=window.__transitionCapture;return{frames:q.frames,bad:q.bad,mix:q.mix};})()`);
  assert.ok(first.frames.length>=15,'Not enough actual playing samples');
  const black=first.frames.filter(f=>f.r+f.g+f.b<15),during=first.frames.filter(f=>f.time>=1.75&&f.time<=2.25);
  const save=(name,data)=>{if(data)fs.writeFileSync(path.join(root,name),Buffer.from(data.split(',')[1],'base64'));};save('first-black.png',first.bad);save('transition-mixture.png',first.mix);
  report.transitionPlayback={samples:first.frames.length,transitionSamples:during.length,blackSamples:black.length,minColorSum:Math.min(...during.map(f=>f.r+f.g+f.b)),distinctPictures:new Set(during.map(f=>f.hash)).size,mediaLatencyMs:120};
  fs.writeFileSync(path.join(root,'playback-frames.json'),JSON.stringify(first.frames));
  if(!baseline){assert.equal(black.length,0,'Black transition picture during playback');assert.ok(new Set(during.map(f=>f.hash)).size>=6,'Transition did not visibly animate');assert.ok(first.mix,'No mixed outgoing/incoming picture');}
  // A playing seek directly into the transition has no prewarm runway.
  await ui(`window.__transitionCapture.frames=[];document.querySelector('[data-word-index="4"]').click();document.querySelector('video').play();void 0;`);
  await until(()=>ui(`Number(document.querySelector('[aria-label="Playhead"]')?.getAttribute('aria-valuenow'))>2.5`),15000);
  const cold=await ui(`(()=>{document.querySelector('video').pause();return window.__transitionCapture.frames;})()`);
  const coldBlack=cold.filter(f=>f.r+f.g+f.b<15);report.coldPlayingSeek={samples:cold.length,blackSamples:coldBlack.length};
  if(!baseline){assert.ok(cold.length>=5);assert.equal(coldBlack.length,0);}
  await ui(`window.__transitionCapture.stop=true;void 0;`);
  report.checks.push('Real continuous base-to-base Xir zoom playback and cold playing seek sampled from the rendered canvas, with 120 ms media latency');
 }finally{session.webRequest.onBeforeRequest(null);}
 if(baseline)return;
 // Complete short exports through both real adapters; validation scans every frame.
 const waitJob=jobId=>until(async()=>{const j=await api('getJob',jobId);if(j.status==='failed')throw Error(j.error);return j.status==='complete'?j:null;},120000);
 const host=require('node:os'),free=host.freemem;
 try{
  d=await api('getRenderDocument',id);const res=await fetch(backend+'/preview/manifest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(require('./manifest-request').manifestRequest(d))});const manifest=await res.json();assert.ok(res.ok);
  const plan=runtime.compileComposition(d.composition,manifest,d.words);report.exports={};
  for(const [name,bytes]of [['native',3.25*1024**3],['compatible',2*1024**3]]){
   host.freemem=()=>bytes;const outputPath=path.join(root,name+'.mp4'),job=await api('startJob',{kind:'export',projectId:id,payload:{document:d,manifest,outputPath,width:1920,height:1080,format:'mp4',studioSound:false,captions:'none'}}),done=await waitJob(job.id);
   report.exports[name]={path:outputPath,metrics:done.result?.metrics};
  }
  report.manifestId=manifest.id;report.projectId=id;report.expectedFrames=Math.ceil(manifest.durationUs*60/1e6);
 }finally{host.freemem=free;}
};
