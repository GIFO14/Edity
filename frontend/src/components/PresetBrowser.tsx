import {useEffect,useRef,useState} from 'react';
import {emptyComposition,defaultTransform,defaultTextStyle} from '../composition/types';
import type {CutManifest} from '../composition/types';
import {presetRegistry,presetInstance} from '../composition/presetRegistry';
import {compileComposition} from '../composition/compiler';
import {Compositor} from '../render/compositor';
export default function PresetBrowser({onApply}:{onApply:(id:string)=>void}){
  const [open,setOpen]=useState(false),[selected,setSelected]=useState('grow');const canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    if(!open||!canvas.current)return;const compositor=new Compositor(canvas.current),document=emptyComposition();document.canvas={width:640,height:360,fps:{num:30,den:1},background:'#111827'};
    document.elements.example={id:'example',kind:'text',trackId:'text',order:0,label:'Example',enabled:true,createdBy:'manual',placement:{kind:'timeline',startUs:0,endUs:2000000},transform:{...defaultTransform(),width:.8,height:.5},presets:[presetInstance(selected)],text:'Your title',textStyle:{...defaultTextStyle(),fontSize:64},sourceInUs:0,endPolicy:'hold'};
    const manifest:CutManifest={id:'preset-preview',inputRevision:'0',durationUs:2000000,keepSegments:[{start:0,end:2}],segments:[{clipId:'example',sourceStartUs:0,sourceEndUs:2000000,editStartUs:0,editEndUs:2000000,globalSourceStartUs:0,joinInUs:0,joinOutUs:0}]};
    const plan=compileComposition(document,manifest),started=performance.now();let animation=0;const draw=()=>{compositor.draw(plan,Math.floor((performance.now()-started)%2500*1000),new Map(),320,180);animation=requestAnimationFrame(draw);};draw();return()=>{cancelAnimationFrame(animation);compositor.dispose();};
  },[open,selected]);
  return <div className="space-y-2"><button onClick={()=>setOpen(!open)} className="text-editor-accent">{open?'▾':'▸'} Browse animations / effects</button>{open&&<><canvas ref={canvas} className="w-full rounded"/><select className="w-full bg-editor-bg rounded border border-editor-border p-1" value={selected} onChange={e=>setSelected(e.target.value)}>{Object.values(presetRegistry).filter(p=>p.kind!=='transition').map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="bg-editor-accent rounded px-2 py-1" onClick={()=>onApply(selected)}>Apply preset</button></>}</div>;
}
