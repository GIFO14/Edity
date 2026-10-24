import {useRef,useEffect,useState} from 'react';
import type {CSSProperties} from 'react';
import {useCompositionStore} from '../store/compositionStore';
import {evaluateFrame} from '../composition/compiler';
import type {Element,RenderPlan} from '../composition/types';
import {projectedCorners} from '../render/compositor';
import {rasterizeText} from '../render/textRasterizer';
import type {FrameLayer} from '../composition/types';
import {commitComposition} from '../lib/projectPersistence';
import ViewerTextEditor from './ViewerTextEditor';
export default function ViewerManipulationLayer({plan,timeUs}:{plan:RenderPlan;timeUs:number}){
  const {selectedId,select,setDraft,projectId}=useCompositionStore();const drag=useRef<{original:Element;x:number;y:number;mode:string;rect:DOMRect;pointerId:number;target:HTMLElement}|null>(null),root=useRef<HTMLDivElement>(null);
  const [editing,setEditing]=useState<{element:Element;position:CSSProperties;fontSize:number;maxHeight:number;projectId:string|null}|null>(null);
  function releaseDrag(){const d=drag.current;drag.current=null;if(d?.target.hasPointerCapture(d.pointerId))d.target.releasePointerCapture(d.pointerId);return d;}
  useEffect(()=>{const cancel=(e:KeyboardEvent)=>{if(e.key==='Escape'&&releaseDrag())setDraft(null);};window.addEventListener('keydown',cancel);return()=>{window.removeEventListener('keydown',cancel);if(releaseDrag())setDraft(null);};},[setDraft]);
  const layers=evaluateFrame(plan,timeUs).filter(l=>l.element.kind!=='base');
  const selectedLayer=layers.find(l=>l.element.id===selectedId)||evaluateFrame(plan,timeUs).find(l=>l.element.id===selectedId);
  function geometry(layer:FrameLayer){const asset=plan.document.assets[layer.element.assetId||''];let aspect=asset?.width&&asset.height?asset.width/asset.height:1;if(layer.element.kind==='text'){const text=rasterizeText(layer.element,plan.document);aspect=text.width/text.height;}const corners=projectedCorners(layer.transform,plan.document.canvas.width,plan.document.canvas.height,aspect),points=corners.map(([x,y])=>[x/plan.document.canvas.width,y/plan.document.canvas.height]),left=Math.min(...points.map(p=>p[0])),top=Math.min(...points.map(p=>p[1])),width=Math.max(.0001,Math.max(...points.map(p=>p[0]))-left),height=Math.max(.0001,Math.max(...points.map(p=>p[1]))-top);return {style:{left:`${left*100}%`,top:`${top*100}%`,width:`${width*100}%`,height:`${height*100}%`,clipPath:`polygon(${[0,1,3,2].map(i=>`${(points[i][0]-left)/width*100}% ${(points[i][1]-top)/height*100}%`).join(',')})`},points};}
  const selected=plan.elements.find(e=>e.id===selectedId),visible=selected&&timeUs>=selected.startUs&&timeUs<selected.endUs&&!selected.suppressed;
  useEffect(()=>{if(editing&&(editing.projectId!==projectId||!layers.some(l=>l.element.id===editing.element.id)))setEditing(null);},[projectId,timeUs,editing,plan]);
  function editText(element:Element){
    const current=useCompositionStore.getState().document.elements[element.id],layer=layers.find(l=>l.element.id===element.id),rect=root.current?.getBoundingClientRect();
    if(!current||current.kind!=='text'||!layer||!rect)return;
    releaseDrag();document.querySelector('video')?.pause();select(element.id);
    const g=geometry(layer),left=Math.min(...g.points.map(p=>p[0])),top=Math.min(...g.points.map(p=>p[1])),width=Math.max(...g.points.map(p=>p[0]))-left;
    const text=rasterizeText(current,plan.document),fontSize=Math.max(14,Math.min(60,current.textStyle!.fontSize*width*rect.width/text.width));
    setEditing({element:structuredClone(current),projectId,position:{left:`clamp(4px, ${left*100}%, calc(100% - 184px))`,top:`${top*100}%`,width:`clamp(180px, ${width*100}%, calc(100% - 8px))`},fontSize,maxHeight:Math.max(40,rect.height-52)});
  }
  function start(e:React.PointerEvent,mode:string,element:Element){if(e.button!==0)return;if(editing){root.current?.querySelector<HTMLTextAreaElement>('textarea')?.blur();e.stopPropagation();return;}const original=useCompositionStore.getState().document.elements[element.id],target=root.current;if(!original||!target)return;e.stopPropagation();e.preventDefault();document.querySelector('video')?.pause();select(element.id);target.setPointerCapture(e.pointerId);const rect=target.getBoundingClientRect();drag.current={original:structuredClone(original),x:e.clientX,y:e.clientY,mode,rect,pointerId:e.pointerId,target};}
  function move(e:React.PointerEvent){const d=drag.current;if(!d||d.pointerId!==e.pointerId)return;const dx=(e.clientX-d.x)/d.rect.width,dy=(e.clientY-d.y)/d.rect.height,t={...d.original.transform};
    if(d.mode==='resize'){t.width=Math.max(.01,t.width+dx*2);t.height=Math.max(.01,t.height+dy*2);}
    else if(d.mode==='pivot'){t.pivotX=Math.max(0,Math.min(1,t.pivotX+dx/t.width));t.pivotY=Math.max(0,Math.min(1,t.pivotY+dy/t.height));}
    else{t.x+=dx;t.y+=dy;}setDraft({...d.original,transform:t});}
  function finish(){const draft=useCompositionStore.getState().draft,d=releaseDrag();if(d&&draft&&draft.id===d.original.id&&JSON.stringify(draft.transform)!==JSON.stringify(d.original.transform))void commitComposition([{type:'update',id:d.original.id,changes:{transform:draft.transform}}],d.mode==='resize'?'Resize element':d.mode==='pivot'?'Move pivot':'Move element').catch(e=>useCompositionStore.setState({error:String(e)})).finally(()=>{if(useCompositionStore.getState().draft===draft)setDraft(null);});else if(d)setDraft(null);}
  return <div ref={root} data-manipulation className="absolute inset-0 pointer-events-none" onDoubleClick={()=>{if(!editing&&selected){if(selected.kind==='text')editText(selected);else window.dispatchEvent(new CustomEvent('edity:inspect-media'));}}} onPointerMove={move} onPointerUp={finish} onPointerCancel={()=>{if(releaseDrag())setDraft(null);}} onLostPointerCapture={e=>{if(drag.current?.pointerId===e.pointerId){releaseDrag();setDraft(null);}}}>
    {layers.map(l=><button key={l.id} aria-label={`Select ${l.element.label}`} title={l.element.kind==='text'?'Double-click to edit text':undefined} className="absolute pointer-events-auto bg-transparent" style={geometry(l).style} onPointerDown={e=>start(e,'move',l.element)} onDoubleClick={e=>{e.stopPropagation();if(l.element.kind==='text')editText(l.element);else{select(l.element.id);window.dispatchEvent(new CustomEvent('edity:inspect-media'));}}}/>)}
    {!editing&&visible&&selectedLayer&&(()=>{const g=geometry(selectedLayer),t=selectedLayer.transform;return <>
      <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points={[0,1,3,2].map(i=>`${g.points[i][0]*100},${g.points[i][1]*100}`).join(' ')} fill="none" stroke="#a78bfa" strokeWidth="1" vectorEffect="non-scaling-stroke"/></svg>
      <button className="absolute w-3 h-3 -translate-x-1/2 -translate-y-1/2 bg-white border border-violet-500 pointer-events-auto cursor-se-resize" style={{left:`${g.points[3][0]*100}%`,top:`${g.points[3][1]*100}%`}} aria-label="Resize element" onPointerDown={e=>start(e,'resize',selected)}/>
      <button className="absolute w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-violet-500 pointer-events-auto" style={{left:`${t.x*100}%`,top:`${t.y*100}%`}} aria-label="Move pivot" onPointerDown={e=>start(e,'pivot',selected)} onDoubleClick={()=>{if(selected.kind==='text')editText(selected);}}/>
      {selected.kind==='text'&&plan.document.elements[selected.id]&&<button aria-label="Edit selected text" title="Edit text directly in the viewer" className="absolute top-2 right-2 rounded bg-violet-600 text-white text-xs px-2 py-1 pointer-events-auto" onPointerDown={e=>{e.preventDefault();e.stopPropagation();}} onClick={()=>editText(selected)}>Edit text</button>}
    </>;})()}
    {editing&&<ViewerTextEditor key={editing.element.id} {...editing} onClose={()=>setEditing(null)}/>}
  </div>;
}
