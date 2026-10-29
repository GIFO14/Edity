const os=require('node:os');
function accelerationOptions(options,resources={cores:os.cpus().length,freeBytes:os.freemem()}){
 const fps=options.plan?.document?.canvas?.fps;
 if(options.gpuCodec!==undefined||options.capture||options.legacyTransport||options.format!=='mp4'||options.width!==1920||options.height!==1080||!fps||![30,60].includes(fps.num/fps.den)||resources.cores<4||resources.freeBytes<3*1024**3)return null;
 // Keep at least 2 GiB for the editor and other applications. Each native
 // renderer gets a conservative 1 GiB budget, with no more than six workers.
 return {gpuCodec:true,gpuPacketDecode:true,gpuParallel:Math.max(1,Math.min(6,Math.floor(resources.cores/2),Math.floor(resources.freeBytes/1024**3)-2))};
}
function acceleratedExport(options,onProgress,render){
 let cancelled=false,active;
 const result=(async()=>{
  try{active=render({...options,...accelerationOptions(options)},onProgress);return await active.result;}
  catch(error){if(cancelled)throw Error('Cancelled');onProgress({progress:0,stage:'Using compatible video encoder'});active=render({...options,gpuCodec:false,gpuParallel:0},onProgress);try{const result=await active.result;return {...result,metrics:{...result.metrics,accelerationFallback:String(error).slice(0,1000)}};}catch(fallback){throw Error(`Native export failed: ${String(error).slice(0,2000)}; Compatible export failed: ${String(fallback).slice(0,4000)}`);}}
 })();
 return {result,cancel(){cancelled=true;active?.cancel();}};
}
module.exports={accelerationOptions,acceleratedExport};
