const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {locateTool}=require('./ffmpeg-paths'),{decoderInputArgs}=require('./decoder-input');
test('JPEG, PNG, WebP, GIF and BMP still images produce one complete frame without input seeking',()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'edity-still-'));
  try{
    for(const extension of ['jpg','png','webp','gif','bmp']){
      const file=path.join(folder,`referència.${extension}`);
      const create=spawnSync(locateTool('ffmpeg'),['-v','error','-y','-f','lavfi','-i','color=orange:s=96x64','-frames:v','1',file],{windowsHide:true});assert.equal(create.status,0,String(create.stderr));
      const args=decoderInputArgs({kind:'image',path:file},{width:96,height:64,fps:30,frame:600});
      const decoded=spawnSync(locateTool('ffmpeg'),args,{windowsHide:true});assert.equal(decoded.status,0,String(decoded.stderr));assert.equal(decoded.stdout.length,96*64*4);
      const [red,green,blue,alpha]=decoded.stdout;assert.ok(red>200&&green>100&&blue<40);assert.equal(alpha,255);
    }
  }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
test('video decoding retains its existing seek and frame rate conversion',()=>{
  assert.deepEqual(decoderInputArgs({kind:'video',path:'video.mp4'},{width:640,height:360,fps:30,frame:90}),
    ['-v','error','-threads','1','-ss','3','-i','video.mp4','-an','-vf','scale=640:360:flags=bicubic,fps=30','-pix_fmt','rgba','-f','rawvideo','pipe:1']);
});
