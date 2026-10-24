import {isColorGraded} from '../composition/colorGrade';
import { Compositor } from '../render/compositor';
import { loadCompositionFonts } from '../render/textRasterizer';
import type { RenderPlan } from '../composition/types';
import { evaluateFrame } from '../composition/compiler';
declare global { interface Window { renderBridge?: { ready:()=>void; receive:(callback:(port:MessagePort)=>void)=>void } } }
const compositor=new Compositor(document.querySelector('canvas')!);
function receive(port:MessagePort){
  let plan:RenderPlan,verifyParity=false;
  port.onmessage=async(event)=>{
    const request=event.data;
    try{
      if(request.type==='init'){plan=request.plan;verifyParity=request.verifyParity;await loadCompositionFonts(plan.document,path=>`file:///${path.replace(/\\/g,'/')}`);port.postMessage({type:'ready'});return;}
      if(request.type==='evaluate'){port.postMessage({type:'evaluated',layers:evaluateFrame(plan,request.timeUs).filter(layer=>layer.element.kind!=='text').map(layer=>({id:layer.id,assetId:layer.element.assetId,sourceTimeUs:layer.sourceTimeUs,colorManaged:isColorGraded(layer.colorGrade)}))});return;}
      if(request.type==='frame'){
        
        const frames=new Map(request.frames.map((frame:{id:string;data:ArrayBuffer;width:number;height:number})=>[frame.id,{data:new Uint8Array(frame.data),width:frame.width,height:frame.height}]));
        const started=performance.now();compositor.draw(plan,request.timeUs,frames as Parameters<Compositor['draw']>[2],request.width,request.height);const rendered=performance.now();const rgba=compositor.readRgba();
        let parity=true;
        if(request.index===0&&verifyParity){const previewCanvas=document.createElement('canvas');const preview=new Compositor(previewCanvas);preview.draw(plan,request.timeUs,frames as Parameters<Compositor['draw']>[2],request.width,request.height);const pixels=preview.readRgba();parity=rgba.every((value,index)=>value===pixels[index]);preview.dispose();}
        port.postMessage({type:'frame',index:request.index,data:rgba,parity,renderMs:rendered-started,readbackMs:performance.now()-rendered});
      }
    }catch(error){port.postMessage({type:'error',error:String(error)});}
  };
  port.start();
}
window.addEventListener('message',event=>{if(event.data?.type==='edity-render-channel'&&event.ports[0])receive(event.ports[0]);});
window.renderBridge?.receive(receive);
window.postMessage({type:'edity-render-ready'},'*');
