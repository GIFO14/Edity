const {spawn}=require('node:child_process');
async function validateExport(options,onChild=()=>{}){
 const {file,ffprobe,width,height,frames,fps,hasAudio,duration}=options;
 const child=spawn(ffprobe,['-v','error','-show_streams','-show_format','-of','json',file],{windowsHide:true,stdio:['ignore','pipe','pipe']});onChild(child);
 let output='',error='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error=(error+b).slice(-4000));
 await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error(error||'Export validation failed')));});
 const metadata=JSON.parse(output),video=metadata.streams?.find(s=>s.codec_type==='video'),audio=metadata.streams?.find(s=>s.codec_type==='audio');
 if(!video||video.width!==width||video.height!==height||Number(video.nb_frames)!==frames||Math.abs(Number(video.duration)-frames/fps)>1/fps+.01||Math.abs(Number(metadata.format.duration)-duration)>1/fps+.05||hasAudio&&(!audio||Math.abs(Number(audio.duration)-duration)>.1))throw Error('Export stream, frame count or duration validation failed: '+JSON.stringify({expected:{width,height,frames,fps,duration,hasAudio},actual:{width:video?.width,height:video?.height,frames:video?.nb_frames,videoDuration:video?.duration,duration:metadata.format?.duration,audioDuration:audio?.duration}}));
 return metadata;
}
module.exports={validateExport};
