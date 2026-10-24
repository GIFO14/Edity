import {Compositor} from '../../frontend/src/render/compositor';
import {FrameProvider} from '../../frontend/src/render/frameProvider';
import {emptyComposition,defaultTransform,defaultTextStyle} from '../../frontend/src/composition/types';
import {presetRegistry,presetInstance} from '../../frontend/src/composition/presetRegistry';
import {compileComposition,evaluateFrame} from '../../frontend/src/composition/compiler';
import {loadCompositionFonts} from '../../frontend/src/render/textRasterizer';
declare global{interface Window{mediaQA:{run:(input:any)=>Promise<any>;compare:(plan:any,timeUs:number,backend:string)=>Promise<string>}}}
window.mediaQA={compare:async(plan,timeUs,backend)=>{const provider=new FrameProvider(backend),compositor=new Compositor(window.document.createElement('canvas'));try{await loadCompositionFonts(plan.document,p=>`${backend}/file?path=${encodeURIComponent(p)}`);const frames=new Map();for(const layer of evaluateFrame(plan,timeUs))if(layer.element.kind!=='text')frames.set(layer.id,await provider.frame(layer,plan.document.assets[layer.element.assetId!],false,1));compositor.draw(plan,timeUs,frames,320,180);return compositor.canvas.toDataURL('image/png');}finally{provider.dispose();compositor.dispose();}},run:async({fixture,backend})=>{
 const check=(condition:unknown,label:string)=>{if(!condition)throw new Error(label);};const report:any={checks:[],strips:[]};
 const document=emptyComposition();document.canvas={width:640,height:360,fps:{num:30,den:1},background:'#000000'};
 const manifest={id:'test',inputRevision:'test',durationUs:2000000,keepSegments:[{start:0,end:2}],segments:[{clipId:'base',sourceStartUs:0,sourceEndUs:2000000,globalSourceStartUs:0,editStartUs:0,editEndUs:2000000,joinInUs:0,joinOutUs:0}]};
 const asset=(id:string,file:string,alpha:boolean,kind:'image'|'video')=>({id,kind,path:`${fixture}/${file}`,hash:id,name:file,width:240,height:140,hasAlpha:alpha,hasAudio:false,durationUs:kind==='video'?2000000:0,status:'ready' as const});
 const element=(id:string,assetId:string,start=0,end=2000000)=>({id,kind:'image' as const,assetId,trackId:'visual',order:1,label:id,enabled:true,createdBy:'manual' as const,placement:{kind:'timeline' as const,startUs:start,endUs:end},transform:defaultTransform(),presets:[],sourceInUs:0,endPolicy:'hold' as const});
 document.assets.alpha=asset('alpha','alpha.png',true,'image');document.elements.alpha=element('alpha','alpha');
 const provider=new FrameProvider(backend),plan=compileComposition(document,manifest),layer=evaluateFrame(plan,0)[0],image=await provider.frame(layer,document.assets.alpha,false,1);
 const rawResponse=await fetch(`${backend}/composition/frame`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:document.assets.alpha.path,timeUs:0,width:240,height:140})});check(rawResponse.ok,'RGBA image service');
 const raw={data:new Uint8Array(await rawResponse.arrayBuffer()),width:240,height:140};
 const a=new Compositor(window.document.createElement('canvas')),b=new Compositor(window.document.createElement('canvas'));let maxDifference=0;
 for(const background of ['#000000','#ffffff']){document.canvas.background=background;const p=compileComposition(document,manifest);a.draw(p,0,new Map([['alpha',image]]),640,360);b.draw(p,0,new Map([['alpha',raw]]),640,360);const x=a.readRgba(),y=b.readRgba();maxDifference=Math.max(maxDifference,...Array.from(x,(v,i)=>Math.abs(v-y[i])).filter((_,i)=>i%1500===0));check(x.every((v,i)=>Math.abs(v-y[i])<=2),'HTML image / worker RGBA alpha parity');}
 a.dispose();b.dispose();report.checks.push({alphaImageParity:true,maxDifference});
 document.assets.alphaVideo=asset('alphaVideo','alpha.mov',true,'video');const videoLayer={...layer,id:'alphaVideo',element:{...element('alphaVideo','alphaVideo'),kind:'video' as const}};
 const first=await provider.frame({...videoLayer,sourceTimeUs:0},document.assets.alphaVideo,false,1) as any;check(first.data[3]===0,'Alpha video transparent corner');check(first.data[(70*first.width+120)*4+3]>0,'Alpha video visible center');
 for(const time of [400000,900000,100000,1600000]){provider.invalidate();await provider.frame({...videoLayer,sourceTimeUs:time},document.assets.alphaVideo,false,1);}provider.dispose();report.checks.push('Alpha video chunks and nonsequential seeks');
 function picture(color:string,label:string){const c=window.document.createElement('canvas');c.width=640;c.height=360;const ctx=c.getContext('2d')!;ctx.fillStyle=color;ctx.fillRect(0,0,640,360);ctx.strokeStyle='#ffffff';for(let i=0;i<640;i+=64){ctx.strokeRect(i,0,32,360);}ctx.fillStyle='#ffffff';ctx.font='bold 60px Arial';ctx.fillText(label,180,200);return c;}
 const out=picture('#215fa9','OUT'),incoming=picture('#ba5631','IN');document.assets.out=asset('out','alpha.png',false,'image');document.assets.in=asset('in','alpha.png',false,'image');document.elements={out:element('out','out',0,1000000),in:element('in','in',1000000,2000000)};
 const compositor=new Compositor(window.document.createElement('canvas'));
 for(const preset of Object.values(presetRegistry).filter(p=>p.kind==='transition')){
   document.transitions={transition:{id:'transition',fromId:'out',toId:'in',atUs:1000000,durationUs:1000000,alignment:'center',preset:presetInstance(preset.id)}};const p=compileComposition(document,manifest);
   const strip=window.document.createElement('canvas');strip.width=1600;strip.height=180;const ctx=strip.getContext('2d')!;
   for(const [i,progress] of [0,.25,.5,.75,.999999].entries()){const time=Math.round(500000+progress*1000000),layers=evaluateFrame(p,time),frames=new Map(layers.map(l=>[l.id,l.element.id==='out'?out:incoming]));compositor.draw(p,time,frames,320,180);check(compositor.gl.getError()===0,`GL error ${preset.id}`);const pixels=compositor.readRgba();check(pixels.some((v,i)=>i%4!==3&&v>100),`Empty ${preset.id} at ${progress}`);ctx.drawImage(compositor.canvas,i*320,0);}
   report.strips.push({name:preset.id,png:strip.toDataURL('image/png')});
 }
 document.transitions={};document.elements={title:{...element('title','out'),kind:'text',assetId:undefined,trackId:'text',text:'Editable title',textStyle:defaultTextStyle()}} as any;
 for(const preset of Object.values(presetRegistry).filter(p=>p.kind!=='transition')){document.elements.title.presets=[presetInstance(preset.id)];await loadCompositionFonts(document,p=>`${backend}/file?path=${encodeURIComponent(p)}`);const p=compileComposition(document,manifest);compositor.draw(p,500000,new Map(),640,360);const first=compositor.readRgba();compositor.draw(p,500000,new Map(),640,360);const replay=compositor.readRgba();check(first.every((v,i)=>v===replay[i]),`Nondeterministic ${preset.id}`);check(compositor.gl.getError()===0,`GL ${preset.id}`);}
 compositor.dispose();report.checks.push('All registered transitions at five progress values and all effects deterministic');return report;
}};
