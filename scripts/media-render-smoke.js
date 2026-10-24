// Automated hidden Electron test. Does not attach to or operate any user's window.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { exportComposition } = require('../electron/render-worker-manager');
process.on('uncaughtException',error=>{console.error(error);app.exit(1);});
process.on('unhandledRejection',error=>{console.error(error);app.exit(1);});
app.on('window-all-closed',()=>{});
app.setPath('userData',path.join(process.env.TEMP || process.env.TMP,`edity-render-smoke-${process.pid}`));
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.whenReady().then(async()=>{
  const runtime=require('../shared/composition-runtime.cjs');
  const dir=path.resolve(__dirname,'../tests/fixtures/composition');
  const document=runtime.emptyComposition();document.canvas.fps={num:30000,den:1001};
  for(const [id,name,width,height,kind] of [['baseAsset','base.mp4',640,360,'video'],['alpha','alpha.png',240,140,'image'],['broll','broll.mp4',320,180,'video']]){
    document.assets[id]={id,kind,path:path.join(dir,name),name,hash:id,width,height,durationUs:kind==='image'?0:2000000,hasAudio:id==='baseAsset',hasAlpha:id==='alpha',status:'ready'};
  }
  function element(id,kind,assetId,transform){return {id,kind,assetId,trackId:kind==='text'?'text':id==='base'?'base':'visual',label:id,order:Object.keys(document.elements).length,enabled:true,createdBy:'manual',placement:{kind:'project',startOffsetUs:0,endOffsetUs:0},transform:{...runtime.defaultTransform(),...transform},presets:[],sourceInUs:0,endPolicy:'hold'};}
  document.elements.base=element('base','base','baseAsset',{});
  document.elements.image=element('image','image','alpha',{x:.25,y:.25,width:.3,height:.3});
  document.elements.broll=element('broll','video','broll',{x:.78,y:.25,width:.3,height:.3});
  for(const [id,text,y] of [['title','Editable title',.62],['subtitle','Alpha + B-roll',.82]])document.elements[id]={...element(id,'text',undefined,{y,height:.18,width:.75}),text,textStyle:runtime.defaultTextStyle(),presets:[runtime.presetInstance('grow')]};
  const manifest={id:'fixture',inputRevision:'fixture',durationUs:2000000,keepSegments:[{start:0,end:2}],segments:[{clipId:'base',sourceStartUs:0,sourceEndUs:2000000,globalSourceStartUs:0,editStartUs:0,editEndUs:2000000,joinInUs:0,joinOutUs:0}]};
  const plan=runtime.compileComposition(document,manifest);
  const evidence=path.resolve(__dirname,'../docs/media-implementation-evidence');
  const results=[];
  for(const [width,height] of [[1920,1080],[3840,2160]]){
    const outputPath=path.join('D:/Edity-media-verification',`fixture-${height}.mp4`);fs.mkdirSync(path.dirname(outputPath),{recursive:true});
    const started=performance.now();let heartbeats=0;const timer=setInterval(()=>heartbeats++,20);
    try{
      let stage='';const result=await exportComposition({plan,outputPath,width,height,format:'mp4',verifyParity:true,audioPath:path.join(dir,'music.wav')},progress=>{if(stage!==progress.stage){stage=progress.stage;console.log(stage);} }).result;
      assert.ok(fs.statSync(outputPath).size>10000);assert.ok(heartbeats>0);
      results.push({...result,width,height,elapsedMs:performance.now()-started,mainEventLoopHeartbeats:heartbeats});
      fs.writeFileSync(path.join(evidence,'render-metrics.json'),JSON.stringify(results,null,2));
    }finally{clearInterval(timer);}
  }
  const longManifest={...manifest,id:'long-many-cuts',durationUs:30000000,segments:Array.from({length:300},(_,i)=>({clipId:'base',sourceStartUs:(i%10)*200000,sourceEndUs:(i%10)*200000+100000,globalSourceStartUs:(i%10)*200000,editStartUs:i*100000,editEndUs:(i+1)*100000,joinInUs:8000,joinOutUs:8000}))};longManifest.keepSegments=longManifest.segments.map(s=>({start:s.globalSourceStartUs/1e6,end:(s.globalSourceStartUs+s.editEndUs-s.editStartUs)/1e6}));const longPlan=runtime.compileComposition(document,longManifest);let pulses=0;const longTimer=setInterval(()=>pulses++,20),began=performance.now();try{const result=await exportComposition({plan:longPlan,outputPath:'D:/Edity-media-verification/long-many-cuts.mp4',width:1280,height:720,format:'mp4'}).result;assert.ok(pulses>100);results.push({...result,test:'30 seconds, 300 cuts, 900 frames',elapsedMs:performance.now()-began,mainEventLoopHeartbeats:pulses});}finally{clearInterval(longTimer);}
  const cancelledPath='D:/Edity-media-verification/cancelled.mp4';fs.writeFileSync(cancelledPath,'previous export');
  let cancellation;
  const job=exportComposition({plan,outputPath:cancelledPath,width:640,height:360,format:'mp4'},p=>{if(p.progress>=10){cancellation=true;job.cancel();}});
  await assert.rejects(job.result,/Cancelled/);assert.ok(cancellation);assert.equal(fs.readFileSync(cancelledPath,'utf8'),'previous export');
  assert.ok(!fs.readdirSync(path.dirname(cancelledPath)).some(name=>name.startsWith('.edity-')));
  results.push({cancellation:'passed',previousOutputPreserved:true});
  fs.writeFileSync(path.join(evidence,'render-metrics.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results));app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
