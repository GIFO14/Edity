import {Compositor} from '../../frontend/src/render/compositor';
import {emptyComposition,defaultTransform} from '../../frontend/src/composition/types';
import {compileComposition} from '../../frontend/src/composition/compiler';
import {presetInstance} from '../../frontend/src/composition/presetRegistry';
declare global{interface Window{checkBorder:()=>{checks:string[];images:Record<string,string>}}}
window.checkBorder=()=>{
 const check=(value:unknown,label:string)=>{if(!value)throw new Error(label);};
 const document=emptyComposition();document.canvas={width:640,height:360,fps:{num:30,den:1},background:'#000000'};
 document.assets.image={id:'image',kind:'image',path:'fixture',hash:'fixture',name:'fixture',durationUs:0,width:640,height:360,hasAudio:false,hasAlpha:false,status:'ready'};
 document.elements.image={id:'image',kind:'image',assetId:'image',trackId:'visual',order:0,label:'image',enabled:true,createdBy:'manual',placement:{kind:'timeline',startUs:0,endUs:1000000},transform:defaultTransform(),presets:[presetInstance('Colored Border')],sourceInUs:0,endPolicy:'hold'};
 const manifest={id:'border',inputRevision:'border',durationUs:1000000,keepSegments:[{start:0,end:1}],segments:[{clipId:'base',sourceStartUs:0,sourceEndUs:1000000,editStartUs:0,editEndUs:1000000,globalSourceStartUs:0,joinInUs:0,joinOutUs:0}]};
 const source=window.document.createElement('canvas');source.width=640;source.height=360;const context=source.getContext('2d')!;context.fillStyle='#804020';context.fillRect(0,0,640,360);
 const compositor=new Compositor(window.document.createElement('canvas')),report={checks:[] as string[],images:{} as Record<string,string>};
 const pixel=(pixels:Uint8Array,x:number,y:number)=>Array.from(pixels.slice((y*640+x)*4,(y*640+x)*4+3));
 const equal=(a:number[],b:number[])=>a.every((v,i)=>Math.abs(v-b[i])<=1);
 const draw=(label:string)=>{compositor.draw(compileComposition(document,manifest),500000,new Map([['image',source]]),640,360);check(compositor.gl.getError()===0,'Border shader GL status');report.images[label]=compositor.canvas.toDataURL('image/png');return compositor.readRgba();};
 try{
  let pixels=draw('white');check(equal(pixel(pixels,12,180),[255,255,255]),'Visible white edge');check(equal(pixel(pixels,50,180),[128,64,32]),'Source preserved inside border');
  document.elements.image.transform.rotation=180;document.elements.image.transform.scaleX=document.elements.image.transform.scaleY=1.14;
  pixels=draw('transformed');check(equal(pixel(pixels,12,180),[255,255,255]),'Canvas border stays visible after rotation/zoom');
  document.elements.image.presets[0].params={color:'#0080ff',width:24,cornerRadius:40,softEdge:0,onCanvas:true};pixels=draw('rounded');check(equal(pixel(pixels,12,180),[0,128,255]),'Custom blue/width');check(!equal(pixel(pixels,0,0),[0,128,255]),'Rounded corner is not a square corner');
  document.elements.image.transform={...defaultTransform(),width:.5,height:.5};document.elements.image.presets[0].params={color:'#ffffff',width:12,cornerRadius:0,softEdge:0,onCanvas:false};pixels=draw('element');check(equal(pixel(pixels,0,180),[0,0,0]),'Element border does not frame canvas');check(equal(pixel(pixels,165,180),[255,255,255]),'Element frame follows element bounds');
  document.elements.image.presets[0].params.width=0;pixels=draw('zero');check(equal(pixel(pixels,165,180),[128,64,32]),'Zero width removes border');
  report.checks.push('Border after transforms, custom color/width, rounded corners, element scope and zero width preserve source pixels');return report;
 }finally{compositor.dispose();}
};
