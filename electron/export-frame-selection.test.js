const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const {selectionFor,selectedFrame,selectedDecoderArgs}=require('./export-frame-selection'),{decoderInputArgs}=require('./decoder-input'),{locateTool}=require('./ffmpeg-paths');
test('sampling matches source rounding, including a negative half-frame phase',()=>{
 for(const start of [0,1/120,100/60+.005]){
  const fps=60,timeUs=start*1e6,first=Math.round(start*fps),s=selectionFor(first,timeUs,fps,30);
  for(let n=0;n<80;n++){s.count=n;assert.equal(selectedFrame(s),Math.round(start*fps+n*fps/30));}
 }
});
test('unused 60 fps graded samples are skipped with bit-identical retained RGBA pixels',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'edity-samples-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'source.mp4'),ffmpeg=locateTool('ffmpeg');
 const made=spawnSync(ffmpeg,['-v','error','-y','-f','lavfi','-i','testsrc2=size=96x64:rate=60:duration=2','-c:v','libx264','-pix_fmt','yuv420p',file],{windowsHide:true});assert.equal(made.status,0,String(made.stderr));
 const asset={kind:'video',path:file,width:96,height:64,color:{format:'yuv420p',space:'bt709',transfer:'bt709',primaries:'bt709',range:'tv'}},size=96*64*4;
 for(const timeUs of [0,8334,123456]){
  const frame=Math.round(timeUs/1e6*60),options={width:96,height:64,fps:60,frame,managed:true},selection=selectionFor(frame,timeUs,60,30);
  const decode=(args,count)=>{args.splice(args.length-1,0,'-frames:v',String(count));const result=spawnSync(ffmpeg,args,{windowsHide:true,maxBuffer:10e6});assert.equal(result.status,0,String(result.stderr));return result.stdout;};
  const original=decode(decoderInputArgs(asset,options),40),selected=decode(selectedDecoderArgs(asset,options,selection),18);assert.equal(selected.length,size*18);
  for(let i=0;i<18;i++){selection.count=i;const at=selectedFrame(selection)-frame;assert.ok(selected.subarray(i*size,(i+1)*size).equals(original.subarray(at*size,(at+1)*size)),`Frame ${i}, source ${at}, phase ${selection.phase}`);}
 }
});
