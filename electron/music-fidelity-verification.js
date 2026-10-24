const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
module.exports=async({win,api,until,report})=>{
 const root=path.dirname(process.env.EDITY_TEST_REPORT),runtime=require('../shared/composition-runtime.cjs'),exe=require('./ffmpeg-paths').locateTool('ffmpeg'),pause=ms=>new Promise(r=>setTimeout(r,ms));
 const ui=code=>win.webContents.executeJavaScript(code,true),words=[0,1,3,4,7,8,10,12].map((s,i)=>({word:'word'+i,start:s,end:s+.5,confidence:1}));
 const p=await api('createManagedProject',path.join(root,'base.mp4'),{title:'Music fidelity QA',words,segments:[{id:0,start:0,end:14,text:words.map(w=>w.word).join(' '),words}],deletedRanges:[],language:'en'}),id=p.id;
 win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Page.enable');
 await win.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:`window.__qaMusic=[];const NativeContext=window.AudioContext;window.AudioContext=class extends NativeContext{createBufferSource(){const node=super.createBufferSource(),start=node.start.bind(node);node.start=(...args)=>{if(node.buffer?.duration===6){const b=node.buffer,n=24000,from=48000;const amplitudes=[];for(let c=0;c<b.numberOfChannels;c++){const v=b.getChannelData(c),a=[];for(const f of [80,440,3000,10000]){let re=0,im=0;for(let i=0;i<n;i++){const w=2*Math.PI*f*i/b.sampleRate;re+=v[from+i]*Math.cos(w);im+=v[from+i]*Math.sin(w);}a.push(2*Math.hypot(re,im)/n);}amplitudes.push(a);}window.__qaMusic.push({when:args[0],offset:args[1],rate:node.playbackRate.value,sampleRate:b.sampleRate,channels:b.numberOfChannels,amplitudes});}return start(...args);};return node;}};`});
 win.webContents.setAudioMuted(true);await win.loadFile(path.join(__dirname,'../frontend/dist/index.html'),{query:{project:id,embedded:'1'}});
 await until(()=>ui(`!!document.querySelector('[data-tracks]')`),45000);
 await ui(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Layers ·')).click()`);
 const point=await ui(`(()=>{const r=document.querySelector('[data-timeline-track="music"]').getBoundingClientRect();return{x:r.left+1,y:r.top+r.height/2};})()`);
 for(const type of ['dragEnter','dragOver','drop'])await win.webContents.debugger.sendCommand('Input.dispatchDragEvent',{type,x:point.x,y:point.y,data:{items:[],files:[path.join(root,'stereo-music.wav')],dragOperationsMask:1}});
 let doc=await until(async()=>{const d=await api('getProjectDocument',id);return Object.values(d.composition.elements).some(e=>e.kind==='audio')?d:null;},45000);
 const music=Object.values(doc.composition.elements).find(e=>e.kind==='audio');assert.equal(music.audio.ducking,false,'Imported music does not automatically change level');
 await api('commitProject',{id:'qa-fixed-gain',projectId:id,baseRevision:doc.revision,actor:'manual',label:'Fixed music volume',operations:[{type:'update',id:music.id,changes:{placement:{kind:'timeline',startUs:0,endUs:14e6},audio:{...music.audio,gainDb:-15,fadeInUs:0,fadeOutUs:0}}}]});
 await ui(`[...document.querySelectorAll('header button')].find(b=>b.textContent==='Media').click()`);
 await until(()=>ui(`document.body.textContent.includes('Lower volume automatically under speech')`),15000);
 const volumeInput=`[...document.querySelectorAll('label')].find(l=>l.textContent.startsWith('Volume (dB)')).querySelector('input')`;
 const typeValue=async(value)=>{await ui(`(()=>{const e=${volumeInput};e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await pause(80);};
 await typeValue('');assert.equal((await api('getProjectDocument',id)).composition.elements[music.id].audio.gainDb,-15);
 await typeValue('-1');assert.equal((await api('getProjectDocument',id)).composition.elements[music.id].audio.gainDb,-15);
 await ui(`(${volumeInput}).dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);await pause(100);assert.equal((await api('getProjectDocument',id)).composition.elements[music.id].audio.gainDb,-15);
 await typeValue('-12');await ui(`(${volumeInput}).dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);
 await until(async()=>(await api('getProjectDocument',id)).composition.elements[music.id].audio.gainDb===-12,10000);
 await typeValue('-15');await ui(`(${volumeInput}).dispatchEvent(new FocusEvent('focusout',{bubbles:true}))`);await until(async()=>(await api('getProjectDocument',id)).composition.elements[music.id].audio.gainDb===-15,10000);
 report.checks.push('Editing an empty/incomplete gain never applies 0dB; Escape cancels valid uncommitted input; Enter/blur apply only the confirmed volume');
 await until(()=>ui(`document.querySelector('video')?.readyState>=2`),45000);
 await pause(600);await ui(`document.querySelector('[data-word-index="3"]').click()`);await pause(200);
 await ui(`document.querySelector('video').play()`);
 await until(()=>ui(`window.__qaMusic.length>=2`),30000);await pause(2300);await ui(`document.querySelector('video').pause()`);
 const scheduled=await ui(`window.__qaMusic`),expected=.05*10**(-15/20);
 for(const node of scheduled){assert.equal(node.channels,2);assert.equal(node.sampleRate,48000);assert.equal(node.rate,1);for(const channel of node.amplitudes)for(const a of channel)assert.ok(Math.abs(a-expected)<.00003,JSON.stringify({a,expected,node}));}
 // Render the ordinary export job, then independently decode its AAC and measure each band/channel.
 const renderDoc=await api('getRenderDocument',id),backend=await api('getBackendUrl'),res=await fetch(backend+'/preview/manifest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(require('./manifest-request').manifestRequest(renderDoc))}),manifest=await res.json();assert.ok(res.ok);
 const outputPath=path.join(root,'music-export.mp4'),started=await api('startJob',{kind:'export',projectId:id,payload:{document:renderDoc,manifest,outputPath,width:320,height:180,format:'mp4',captions:'none',studioSound:false}});
 await until(async()=>{const j=await api('getJob',started.id);if(j.status==='failed')throw new Error(j.error);return j.status==='complete';},120000);
 const result=spawnSync(exe,['-v','error','-ss','7','-i',outputPath,'-t','0.5','-ar','48000','-ac','2','-f','f32le','pipe:1'],{windowsHide:true});assert.equal(result.status,0,result.stderr.toString());const n=result.stdout.length/8;
 const exported=[];for(let c=0;c<2;c++){const bands=[];for(const f of [80,440,3000,10000]){let re=0,im=0;for(let i=0;i<n;i++){const v=result.stdout.readFloatLE(i*8+c*4),phase=2*Math.PI*f*i/48000;re+=v*Math.cos(phase);im+=v*Math.sin(phase);}const a=2*Math.hypot(re,im)/n;assert.ok(Math.abs(a/expected-1)<.05,JSON.stringify({f,c,a,expected}));bands.push(a);}exported.push(bands);}
 report.musicFidelity={defaultDucking:false,expectedAmplitude:expected,scheduledPlayback:scheduled,exportAmplitudes:exported,exportBytes:fs.statSync(outputPath).size};
 report.checks.push('Native local music drop defaults to steady volume; explicit auto-lowering label; actual scheduled stereo AudioBuffers preserve 80/440/3000/10000 Hz at -15dB; normal video export retains every band in both channels within 5% AAC tolerance');
};
