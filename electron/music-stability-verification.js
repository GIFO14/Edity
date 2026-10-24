const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{spawnSync}=require('node:child_process');
module.exports=async({win,api,until,report})=>{
 const root=path.dirname(process.env.EDITY_TEST_REPORT),runtime=require('../shared/composition-runtime.cjs'),pause=ms=>new Promise(r=>setTimeout(r,ms));
 const words=[[0,.8],[.95,1.7],[2,2.8],[3.3,4],[4.8,5.4],[6,7],[11,14.5]].map(([start,end],i)=>({word:'word'+i,start,end,confidence:1}));
 const p=await api('createManagedProject',path.join(root,'base.mp4'),{title:'Smooth music QA',words,segments:[],deletedRanges:[],language:'en'});
 const started=await api('startJob',{kind:'asset',projectId:p.id,payload:{path:path.join(root,'music.wav'),kind:'audio'}});
 const asset=await until(async()=>{const j=await api('getJob',started.id);if(j.status==='failed')throw Error(j.error);return j.status==='complete'?j.result.asset:null;},30000);
 const d=await api('getProjectDocument',p.id);
 await api('commitProject',{id:'qa-music',projectId:p.id,baseRevision:d.revision,actor:'manual',label:'QA music',operations:[{type:'add',element:{id:'music',kind:'audio',assetId:asset.id,trackId:'music',order:1,label:'Music test',enabled:true,createdBy:'manual',placement:{kind:'timeline',startUs:0,endUs:18e6},transform:runtime.defaultTransform(),presets:[],sourceInUs:0,endPolicy:'trim',audio:{gainDb:-6,mute:false,fadeInUs:0,fadeOutUs:0,ducking:true,bus:'music'}}}]});
 await until(()=>win.webContents.executeJavaScript(`!![...document.querySelectorAll('aside span[title]')].find(n=>n.title==='Smooth music QA')`),10000);
 await win.webContents.executeJavaScript(`[...document.querySelectorAll('aside span[title]')].find(n=>n.title==='Smooth music QA').closest('button').click()`);
 const view=await until(()=>win.getBrowserViews().find(v=>{try{return new URL(v.webContents.getURL()).searchParams.get('project')===p.id;}catch{return false;}}),30000),ui=code=>view.webContents.executeJavaScript(code,true);
 await until(()=>ui(`document.querySelector('video')?.readyState>=2&&document.querySelector('canvas')?.width>0`),45000);
 view.webContents.setAudioMuted(true);
 await ui(`window.__musicNodes=[];const native=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){if(this.buffer?.duration===6){const b=this.buffer,v=b.getChannelData(0),rms=[];for(let j=0;j<12;j++){let sum=0;for(let i=j*24000;i<(j+1)*24000;i++)sum+=v[i]*v[i];rms.push(Math.sqrt(sum/24000));}window.__musicNodes.push({when:args[0],offset:args[1],rms});}return native.apply(this,args);};void 0;`);
 await ui(`document.querySelector('video').play()`);await until(()=>ui(`window.__musicNodes.length>=2`),20000);await pause(500);await ui(`document.querySelector('video').pause()`);
 const nodes=await ui(`window.__musicNodes`),quiet=.1*10**(-6/20)*.25/Math.sqrt(2),loud=quiet*4;
 for(const level of nodes[0].rms)assert.ok(Math.abs(level/quiet-1)<.002,JSON.stringify({level,quiet}));
 assert.ok(Math.abs(nodes[1].rms[0]/quiet-1)<.002);assert.ok(Math.abs(nodes[1].rms[6]/loud-1)<.002);
 const document=await api('getRenderDocument',p.id),backend=await api('getBackendUrl'),res=await fetch(backend+'/preview/manifest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(require('./manifest-request').manifestRequest(document))}),manifest=await res.json();assert.ok(res.ok);
 const outputPath=path.join(root,'smooth-music.mp4'),job=await api('startJob',{kind:'export',projectId:p.id,payload:{document,manifest,outputPath,width:320,height:180,format:'mp4',captions:'none',studioSound:false}});
 await until(async()=>{const j=await api('getJob',job.id);if(j.status==='failed')throw Error(j.error);return j.status==='complete';},120000);
 const ffmpeg=require('./ffmpeg-paths').locateTool('ffmpeg'),measurements=[];
 for(const [time,expected]of [[1.5,quiet],[3.5,quiet],[6.5,quiet],[9,loud],[12.5,quiet]]){
  const result=spawnSync(ffmpeg,['-v','error','-ss',String(time),'-i',outputPath,'-t','0.25','-ar','48000','-ac','2','-f','f32le','pipe:1'],{windowsHide:true});assert.equal(result.status,0,result.stderr.toString());let sum=0;const n=result.stdout.length/8;for(let i=0;i<n;i++)sum+=result.stdout.readFloatLE(i*8)**2;const rms=Math.sqrt(sum/n);assert.ok(Math.abs(rms/expected-1)<.05,JSON.stringify({time,rms,expected}));measurements.push({time,rms,expected});
 }
 report.scheduledPlayback=nodes;report.exportMeasurements=measurements;report.exportBytes=fs.statSync(outputPath).size;report.checks.push('Actual playback buffers stay level through phrase pauses and six-second boundaries; long silence restores volume gradually; ordinary MP4 export matches expected music gain within 5% AAC tolerance');
};
