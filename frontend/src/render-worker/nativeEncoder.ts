interface NativeOptions {width:number;height:number;fps:number;onChunk:(data:Uint8Array)=>void}
// Native H.264 encodes the existing compositor's canvas, avoiding RGBA readback.
// The source decoder, frame selection and color shaders remain the stable path.
export async function createNativeEncoder(options:NativeOptions){
 if(typeof VideoEncoder==='undefined')throw Error('Native video encoding is unavailable');
 const config={codec:'avc1.640028',width:options.width,height:options.height,framerate:options.fps,hardwareAcceleration:'prefer-hardware',latencyMode:'quality',bitrateMode:'quantizer',avc:{format:'annexb'}} as VideoEncoderConfig;
 if(!(await VideoEncoder.isConfigSupported(config)).supported)throw Error('Native H.264 configuration is unsupported');
 let error:Error|undefined,closed=false;
 const encoder=new VideoEncoder({output:chunk=>{try{const bytes=new Uint8Array(chunk.byteLength);chunk.copyTo(bytes);options.onChunk(bytes);}catch(e){error=e as Error;}},error:e=>{error=e;}});
 encoder.configure(config);
 const check=()=>{if(error)throw error;if(closed)throw Error('Encoder closed');};
 return {
  async encode(canvas:HTMLCanvasElement,index:number,timeUs:number){
   check();const frame=new VideoFrame(canvas,{timestamp:timeUs,duration:Math.round(1e6/options.fps)});
   try{encoder.encode(frame,{keyFrame:index%60===0,avc:{quantizer:0}} as VideoEncoderEncodeOptions);}finally{frame.close();}
   const deadline=performance.now()+30000;
   while(encoder.encodeQueueSize>6){check();if(performance.now()>deadline)throw Error('Native encoder timed out');await new Promise(r=>setTimeout(r,1));}check();
  },
  async finish(){check();let timer:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([encoder.flush(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Native encoder flush timed out')),30000);})]);check();}finally{clearTimeout(timer);}},
  close(){if(closed)return;closed=true;if(encoder.state!=='closed')encoder.close();}
 };
}
