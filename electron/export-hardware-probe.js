module.exports=async({win,report})=>{
 report.webcodecs=await win.webContents.executeJavaScript(`(async()=>{
  const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;const gl=canvas.getContext('webgl2',{alpha:false});const debug=gl.getExtension('WEBGL_debug_renderer_info');
  const result={webgl:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),decoder:typeof VideoDecoder,encoder:typeof VideoEncoder,frame:typeof VideoFrame,configs:[]};
  for(const codec of ['avc1.640028','avc1.640034','av01.0.08M.08'])for(const bitrateMode of ['variable','quantizer']){
   const config={codec,width:1920,height:1080,framerate:30,hardwareAcceleration:'prefer-hardware',latencyMode:'quality',bitrateMode,...(bitrateMode==='variable'?{bitrate:40000000}:{}),...(codec.startsWith('avc')?{avc:{format:'annexb'}}:{})};
   try{result.configs.push({config,supported:(await VideoEncoder.isConfigSupported(config)).supported});}catch(error){result.configs.push({config,error:String(error)});}
  }
  let error=null,bytes=0,frames=0;const encoder=new VideoEncoder({output:chunk=>{frames++;bytes+=chunk.byteLength;},error:e=>{error=String(e);}});
  const start=performance.now();
  try{
   encoder.configure({codec:'avc1.640028',width:1920,height:1080,framerate:30,hardwareAcceleration:'prefer-hardware',latencyMode:'quality',bitrateMode:'quantizer',avc:{format:'annexb'}});
   for(let i=0;i<180;i++){gl.clearColor(i/180,.2,.3,1);gl.clear(gl.COLOR_BUFFER_BIT);const frame=new VideoFrame(canvas,{timestamp:Math.round(i*1e6/30),duration:33333});encoder.encode(frame,{keyFrame:i===0,avc:{quantizer:0}});frame.close();if(encoder.encodeQueueSize>8)await new Promise(r=>encoder.addEventListener('dequeue',r,{once:true}));if(error)throw Error(error);}
   await encoder.flush();result.encode={wallMs:performance.now()-start,bytes,frames};
  }catch(e){result.encode={error:String(e)};}finally{if(encoder.state!=='closed')encoder.close();}
  return result;
 })()`);
 report.gpu=await require('electron').app.getGPUInfo('complete');
 report.checks.push('Hardware codec capability probe');
};
