import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {CSSProperties} from 'react';
import type {Element} from '../composition/types';
import {useCompositionStore} from '../store/compositionStore';
import {commitComposition} from '../lib/projectPersistence';

export default function ViewerTextEditor({element,position,fontSize,maxHeight,onClose}:{element:Element;position:CSSProperties;fontSize:number;maxHeight:number;onClose:()=>void}){
  const [text,setText]=useState(element.text||''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const area=useRef<HTMLTextAreaElement>(null),panel=useRef<HTMLDivElement>(null),value=useRef(text),settled=useRef(false),preview=useRef<Element|null>(null);
  const projectId=useRef(useCompositionStore.getState().projectId).current;
  const height=Math.max(40,Math.min(maxHeight,180,Math.max(56,text.split('\n').length*fontSize*1.25+12)));
  const fontAsset=useCompositionStore.getState().document.assets[element.textStyle?.fontAssetId||''];
  const clearPreview=()=>{if(useCompositionStore.getState().draft===preview.current)useCompositionStore.getState().setDraft(null);};
  useLayoutEffect(()=>{area.current?.focus({preventScroll:true});area.current?.select();},[]);
  useEffect(()=>{settled.current=false;const outside=(e:PointerEvent)=>{if(e.button===0&&!panel.current?.contains(e.target as Node))void save();};window.addEventListener('pointerdown',outside,true);return()=>{settled.current=true;window.removeEventListener('pointerdown',outside,true);clearPreview();};},[]);
  function change(next:string){
    value.current=next;setText(next);setError('');
    const current=useCompositionStore.getState().document.elements[element.id];if(!current)return;
    const nextDraft={...current,text:next};preview.current=nextDraft;useCompositionStore.getState().setDraft(nextDraft);
  }
  function cancel(){if(settled.current||busy)return;settled.current=true;clearPreview();onClose();}
  async function save(){
    if(settled.current||busy)return;
    const state=useCompositionStore.getState(),current=state.document.elements[element.id];
    if(state.projectId!==projectId||!current){cancel();return;}
    if(value.current===(current.text||'')){settled.current=true;clearPreview();onClose();return;}
    if((current.text||'')!==(element.text||'')){setError('This text changed elsewhere. Copy your text and reopen the layer.');area.current?.focus({preventScroll:true});return;}
    settled.current=true;setBusy(true);
    try{await commitComposition([{type:'update',id:element.id,changes:{text:value.current}}],'Edit text in viewer');clearPreview();onClose();}
    catch(e){settled.current=false;setBusy(false);setError(String(e));area.current?.focus({preventScroll:true});}
  }
  return <div ref={panel} data-viewer-text-editor className="absolute z-50 pointer-events-auto rounded border border-violet-300 shadow-xl bg-[#0b0e14] text-white" style={{...position,top:`clamp(4px, ${position.top}, calc(100% - ${height+40}px))`}} onPointerDown={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()}>
    <textarea ref={area} aria-label="Edit text in viewer" value={text} readOnly={busy} spellCheck={false} className="block w-full resize-none bg-transparent text-white outline-none px-2 py-1" style={{fontSize,fontFamily:fontAsset?`edity-font-${fontAsset.hash||fontAsset.id}`:element.textStyle?.fontFamily,lineHeight:1.25,minHeight:40,height,textAlign:element.textStyle?.align||'left',fontWeight:element.textStyle?.fontWeight||400}} onChange={e=>change(e.target.value)} onBlur={e=>{if(!panel.current?.contains(e.relatedTarget as Node|null))void save();}} onKeyDown={e=>{
      e.stopPropagation();if(e.nativeEvent.isComposing)return;
      if(e.key==='Escape'){e.preventDefault();cancel();}
      else if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();void save();}
    }}/>
    <div className="flex items-center gap-2 px-2 py-1 border-t border-white/20 text-[11px]" onPointerDown={e=>e.preventDefault()}>
      <span className="flex-1 text-white/65">Ctrl+Enter · save · Esc · cancel</span>
      <button aria-label="Save viewer text" disabled={busy} onClick={()=>void save()} className="rounded bg-violet-500 px-2 py-1">{busy?'Saving…':'Save'}</button>
      <button aria-label="Cancel viewer text" disabled={busy} onClick={cancel}>Cancel</button>
    </div>
    {error&&<p role="alert" className="text-xs text-red-300 px-2 py-1 break-words">{error}</p>}
  </div>;
}
