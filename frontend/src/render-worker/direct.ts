import {createNativeEncoder} from './nativeEncoder';
import {isColorGraded} from '../composition/colorGrade';
import {Compositor} from '../render/compositor';
import {loadCompositionFonts} from '../render/textRasterizer';
import {evaluateFrame} from '../composition/compiler';
import type {RenderPlan} from '../composition/types';

// Bundled as CommonJS for the isolated preload world, with no page API exposed.
export function createDirectRenderer(){
 const compositor=new Compositor(document.querySelector('canvas')!);let plan:RenderPlan,verifyParity=false;let native:Awaited<ReturnType<typeof createNativeEncoder>>|undefined;
 const gl=compositor.canvas.getContext('webgl2')!,pack=gl.createBuffer()!;let packSize=0;
 const read=async()=>{
  const width=compositor.canvas.width,height=compositor.canvas.height,size=width*height*4;
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER,pack);if(packSize!==size){gl.bufferData(gl.PIXEL_PACK_BUFFER,size,gl.STREAM_READ);packSize=size;}
  gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,0);const fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);gl.flush();
  if(!fence)throw Error('Export GPU readback unavailable');
  try{
   const deadline=performance.now()+60000;
   for(;;){const status=gl.clientWaitSync(fence,0,0);if(status===gl.ALREADY_SIGNALED||status===gl.CONDITION_SATISFIED)break;if(status===gl.WAIT_FAILED||performance.now()>deadline)throw Error('Export GPU readback timed out');await new Promise(r=>setTimeout(r,1));}
   const pixels=new Uint8Array(size);gl.getBufferSubData(gl.PIXEL_PACK_BUFFER,0,pixels);
   const stride=width*4,row=new Uint8Array(stride);for(let y=0;y<Math.floor(height/2);y++){const a=y*stride,b=(height-1-y)*stride;row.set(pixels.subarray(a,a+stride));pixels.copyWithin(a,b,b+stride);pixels.set(row,b);}return pixels;
  }finally{gl.deleteSync(fence);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);}
 };
 return async(request:any)=>{
  if(request.type==='close'){native?.close();compositor.dispose();gl.deleteBuffer(pack);return{};}
  if(request.type==='finish'){await native?.finish();return{};}
  if(request.type==='init'){if(request.nativeEncode)native=await createNativeEncoder(request.nativeEncode);plan=request.plan;verifyParity=request.verifyParity;await loadCompositionFonts(plan.document,p=>`file:///${p.replace(/\\/g,'/')}`);return{};}
  if(request.type==='evaluate')return{layers:evaluateFrame(plan,request.timeUs).filter(l=>l.element.kind!=='text').map(l=>({id:l.id,assetId:l.element.assetId,sourceTimeUs:l.sourceTimeUs,colorManaged:isColorGraded(l.colorGrade)}))};
  if(request.type==='frame'){
   const frames=new Map(request.frames.map((f:any)=>[f.id,f.nativeFrame||{data:f.data,width:f.width,height:f.height}]));
   const started=performance.now();compositor.draw(plan,request.timeUs,frames as Parameters<Compositor['draw']>[2],request.width,request.height);const rendered=performance.now();
   if(native){await native.encode(compositor.canvas,request.index,request.outputTimeUs??request.timeUs);return{renderMs:rendered-started,readbackMs:0};}
   const data=await read();
   let parity=true;
   if(request.index===0&&verifyParity){const preview=new Compositor(document.createElement('canvas'));preview.draw(plan,request.timeUs,frames as Parameters<Compositor['draw']>[2],request.width,request.height);const pixels=preview.readRgba();parity=data.every((v,i)=>v===pixels[i]);preview.dispose();}
   return{data,parity,renderMs:rendered-started,readbackMs:performance.now()-rendered};
  }
  throw Error('Unknown render request');
 };
}
