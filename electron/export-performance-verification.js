const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async({win,until,report})=>{
 const root=path.dirname(process.env.EDITY_TEST_REPORT),payload=JSON.parse(fs.readFileSync(path.join(root,'snapshot.json'),'utf8'));
 const {assetPaths}=require('./asset-library'),runtime=require('../shared/composition-runtime.cjs'),{JobCoordinator}=require('./job-coordinator'),{exportComposition}=require('./render-worker-manager');
 const document=assetPaths(payload.document,process.env.EDITY_TEST_SOURCE_DIRECTORY);
 const plan=runtime.compileComposition(document.composition,payload.manifest,document.words);
 plan.manifest.durationUs=Number(process.env.EDITY_TEST_BENCH_SECONDS||8)*1e6;
 const coordinator=new JobCoordinator(path.join(root,'benchmark-jobs'),{getDocument:()=>document});
 let writes=0;coordinator.on('changed',job=>{writes++;win.webContents.send('job:changed',job);});
 const started=performance.now();
 coordinator.register('export',async(_payload,ctx)=>{
  const render=exportComposition({plan,outputPath:path.join(root,'benchmark.mp4'),width:1920,height:1080,format:'mp4',gpuCodec:process.env.EDITY_TEST_GPU_PIPELINE==='1',gpuDecode:process.env.EDITY_TEST_GPU_DECODE==='1',gpuPacketDecode:process.env.EDITY_TEST_GPU_PACKETS==='1',gpuParallel:Number(process.env.EDITY_TEST_GPU_PARALLEL||0),synchronousReadback:process.env.EDITY_TEST_SYNC_READBACK==='1',referenceCrf:process.env.EDITY_TEST_REFERENCE_CRF?Number(process.env.EDITY_TEST_REFERENCE_CRF):undefined},p=>ctx.progress(5+(p.progress||0)*.94,p.stage));
  ctx.registerCancel(()=>render.cancel());return render.result;
 },{resource:'export'});
 const job=coordinator.start({kind:'export',projectId:document.id,payload});
 if(process.env.EDITY_TEST_EXPORT_CANCEL==='1'){
  await until(()=>coordinator.get(job.id).progress>=6,60000);await coordinator.cancel(job.id);
  report.cancelled=coordinator.get(job.id).status==='cancelled';report.noPartialOutput=!fs.existsSync(path.join(root,'benchmark.mp4'))&&!fs.readdirSync(root).some(f=>f.startsWith('.edity-'));
  assert.ok(report.cancelled&&report.noPartialOutput);report.checks.push('Cancellation stops native export and removes its private incomplete output');await coordinator.shutdown();return;
 }
 const completed=await until(()=>{const j=coordinator.get(job.id);if(['failed','cancelled'].includes(j.status))throw Error(j.error);return j.status==='complete'?j:null;},360000);
 report.export={wallMs:performance.now()-started,notifications:writes,metrics:completed.result.metrics,bytes:fs.statSync(path.join(root,'benchmark.mp4')).size};
 report.export.fps=report.export.metrics.frames/(report.export.wallMs/1000);
 assert.equal(report.export.metrics.frames,Math.ceil(plan.manifest.durationUs/1e6*30));assert.ok(report.export.bytes>1000);
 report.checks.push('1080p real-project composition export including native job progress persistence and IPC notifications');
 await coordinator.shutdown();
};
