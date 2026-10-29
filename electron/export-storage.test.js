const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {outputStage,encoderFailure}=require('./export-storage');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'edity-storage-test-'));t.after(()=>{assert.equal(path.dirname(root),os.tmpdir());fs.rmSync(root,{recursive:true,force:true});});return root;}
test('only a closed completed local file is published; old output survives cancellation',async t=>{
 const root=fixture(t),target=path.join(root,'video.mp4');fs.writeFileSync(target,'previous');
 const stage=outputStage({outputPath:target,format:'mp4',scratchDirectory:root});assert.notEqual(path.dirname(stage.file),path.dirname(target));fs.writeFileSync(stage.file,'complete');
 await assert.rejects(stage.publish(()=>true),/Cancelled/);assert.equal(fs.readFileSync(target,'utf8'),'previous');stage.cleanup();assert.ok(!fs.existsSync(stage.directory));
 const second=outputStage({outputPath:target,format:'mp4',scratchDirectory:root});fs.writeFileSync(second.file,'complete');await second.publish();second.cleanup();assert.equal(fs.readFileSync(target,'utf8'),'complete');
});
test('a failed destination publication retains a complete local recovery copy',async t=>{
 const root=fixture(t),target=path.join(root,'destination.mp4');fs.mkdirSync(target);const stage=outputStage({outputPath:target,format:'mp4',scratchDirectory:root});fs.writeFileSync(stage.file,'complete');
 await assert.rejects(stage.publish(),/complete locally at/);stage.cleanup();assert.equal(fs.readFileSync(stage.file,'utf8'),'complete');fs.rmSync(stage.directory,{recursive:true});
 assert.deepEqual(fs.readdirSync(root),['destination.mp4']);
});
test('broken encoder pipes surface the FFmpeg failure, with a bounded wait',async()=>{
 const done=Promise.reject(Error('FFmpeg (1): No space left on device'));done.catch(()=>{});
 assert.match((await encoderFailure(Error('write EOF'),done)).message,/No space left on device/);
 const error=Error('Invalid frame');assert.equal(await encoderFailure(error,Promise.resolve()),error);
});
test('a concurrent destination change is never overwritten by a finishing render',async t=>{
 const root=fixture(t),target=path.join(root,'video.mp4'),stage=outputStage({outputPath:target,format:'mp4',scratchDirectory:root});fs.writeFileSync(stage.file,'complete');fs.writeFileSync(target,'another export');
 await assert.rejects(stage.publish(),/destination was changed/);assert.equal(fs.readFileSync(target,'utf8'),'another export');stage.cleanup();fs.rmSync(stage.directory,{recursive:true});
});
test('a fractional final frame is encoded on the same ceil frame grid as the compositor',async t=>{
 const root=fixture(t),runtime=require('../shared/composition-runtime.cjs'),document=runtime.emptyComposition();document.canvas={...document.canvas,width:64,height:64,fps:{num:60,den:1}};
 const manifest={id:'fraction',inputRevision:'fraction',durationUs:2123456,segments:[],keepSegments:[]},plan=runtime.compileComposition(document,manifest);
 const outputPath=path.join(root,'fraction.mp4'),render=require('./media-render-pipeline').createRenderPipeline({plan,outputPath,width:64,height:64,format:'mp4',gpuCodec:false,scratchDirectory:root},{renderRequest:async request=>request.type==='frame'?{data:new Uint8Array(64*64*4).fill(255),renderMs:0,readbackMs:0}:{} });
 const done=await render.result;assert.equal(done.metrics.frames,128);
 const metadata=await require('./export-output-validation').validateExport({file:outputPath,ffprobe:require('./ffmpeg-paths').locateTool('ffprobe'),width:64,height:64,frames:128,fps:60,hasAudio:false,duration:2.123456});
 assert.equal(Number(metadata.streams[0].nb_frames),128);
});
