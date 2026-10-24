import {useEffect,useState} from 'react';
import {useCompositionStore} from '../store/compositionStore';
import {useEditorStore} from '../store/editorStore';
import {defaultColorGrade,normalizeColorGrade} from '../composition/colorGrade';
import type {ColorGrade,ColorGradePreset,Operation} from '../composition/types';
import {commitComposition} from '../lib/projectPersistence';
export default function ColorGradingControls({targetId}:{targetId?:string}){
  const {document,selectedId}=useCompositionStore(),clips=useEditorStore(s=>s.clips),time=useEditorStore(s=>s.currentTime);
  const [scopeChoice,setScope]=useState<'source'|'element'>('source'),[sourceId,setSourceId]=useState(clips[0]?.id||''),[layerId,setLayerId]=useState(selectedId||'base');
  const scope=targetId?'element':scopeChoice;
  useEffect(()=>{if(!clips.some(c=>c.id===sourceId)&&!document.assets[sourceId])setSourceId(clips[0]?.id||Object.values(document.assets).find(a=>['video','image'].includes(a.kind))?.id||'');},[clips,sourceId,document.assets]);
  const id=targetId||(scope==='source'?sourceId:layerId),stored=scope==='source'?document.sourceGrades?.[id]:document.elements[id]?.colorGrade;
  const parent=scope==='element'?(document.elements[id]?.kind==='base'?clips.find(c=>c.start<=time&&time<c.start+c.duration)?.id:document.elements[id]?.assetId):undefined;
  const effective=stored??(scope==='element'?(parent?document.sourceGrades?.[parent]:undefined)??document.sourceGrades?.[document.elements[id]?.assetId||'']:undefined);
  const savedKey=JSON.stringify(effective??null);
  const [grade,setGrade]=useState<ColorGrade>(defaultColorGrade()),[copied,setCopied]=useState<ColorGrade|null>(null),[busy,setBusy]=useState(false);
  const [presets,setPresets]=useState<ColorGradePreset[]>([]),[presetId,setPresetId]=useState(''),[presetName,setPresetName]=useState(''),[presetStatus,setPresetStatus]=useState(''),[presetError,setPresetError]=useState('');
  const selectedPreset=presets.find(p=>p.id===presetId);
  useEffect(()=>{
    let live=true;const refresh=()=>{void window.electronAPI?.getEditingLibrary().then(data=>{if(live)setPresets(Object.values(data.colorGrades||{}).sort((a,b)=>a.name.localeCompare(b.name)));}).catch(error=>{if(live)setPresetError(String(error));});};
    refresh();const unsubscribe=window.electronAPI?.onEditingLibraryChanged(refresh);window.addEventListener('focus',refresh);return()=>{live=false;unsubscribe?.();window.removeEventListener('focus',refresh);};
  },[]);
  useEffect(()=>{setGrade(normalizeColorGrade(effective));useCompositionStore.setState({colorPreview:null});},[scope,id,savedKey]);
  useEffect(()=>()=>{useCompositionStore.setState({colorPreview:null});},[]);
  const update=(next:ColorGrade)=>{setGrade(next);if(id)useCompositionStore.setState({colorPreview:{scope,id,grade:next}});};
  async function save(reset=false,value=grade,label=reset?'Reset color grade':'Color grade'){if(!id)return false;setBusy(true);try{
    const op:Operation=scope==='source'?{type:'sourceGrade',sourceId:id,grade:reset?null:value}:{type:'update',id,changes:{colorGrade:reset?null:value}};
    await commitComposition([op],label);setGrade(normalizeColorGrade(reset?null:value));useCompositionStore.setState({colorPreview:null,error:''});return true;
  }catch(error){useCompositionStore.setState({error:String(error)});setPresetError(String(error));return false;}finally{setBusy(false);}}
  async function savePreset(overwrite=false){
    if(!window.electronAPI||!presetName.trim()||overwrite&&!selectedPreset)return;
    setBusy(true);setPresetError('');setPresetStatus('');try{
      const saved=await window.electronAPI.saveEditingLibrary('colorGrades',{name:presetName,grade:structuredClone(grade),...(overwrite?{id:selectedPreset!.id,expectedRevision:selectedPreset!.revision}:{})}) as unknown as ColorGradePreset;
      const data=await window.electronAPI.getEditingLibrary();setPresets(Object.values(data.colorGrades).sort((a,b)=>a.name.localeCompare(b.name)));setPresetId(saved.id);setPresetName(saved.name);setPresetStatus(`Saved “${saved.name}” for all projects.`);
    }catch(error){setPresetError(String(error));}finally{setBusy(false);}
  }
  async function applyPreset(){if(!selectedPreset)return;setPresetError('');setPresetStatus('');if(await save(false,structuredClone(selectedPreset.grade),`Apply color preset: ${selectedPreset.name}`))setPresetStatus(`Applied “${selectedPreset.name}”.`);}
  const controls=[['exposure','Exposure (stops)',-5,5,.05],['temperature','Warmth',-1,1,.01],['tint','Tint (green ↔ magenta)',-1,1,.01],['contrast','Contrast',0,3,.01],['saturation','Saturation',0,3,.01],['shadows','Shadows',-1,1,.01],['midtones','Midtones',-1,1,.01],['highlights','Highlights',-1,1,.01],['rolloff','Highlight roll-off',0,1,.01]] as const;
  return <details open className="border border-editor-border rounded p-2" data-color-grading><summary className="font-semibold cursor-pointer">Color correction / grading</summary>
    <div className="space-y-2 mt-2">
      {!targetId&&<><select aria-label="Grade scope" className="w-full bg-editor-bg" value={scope} onChange={e=>setScope(e.target.value as typeof scope)}><option value="source">Recording / media source</option><option value="element">Individual layer</option></select>
      {scope==='source'?<select aria-label="Grade source" className="w-full bg-editor-bg" value={sourceId} onChange={e=>setSourceId(e.target.value)}>{clips.map(c=><option key={c.id} value={c.id}>Recording · {c.name}</option>)}{Object.values(document.assets).filter(a=>a.kind==='video'||a.kind==='image').map(a=><option key={a.id} value={a.id}>Media · {a.name}</option>)}</select>:<select aria-label="Grade layer" className="w-full bg-editor-bg" value={layerId} onChange={e=>setLayerId(e.target.value)}>{Object.values(document.elements).filter(e=>!['text','audio'].includes(e.kind)).map(e=><option key={e.id} value={e.id}>{e.label}</option>)}</select>}</>}
      <div className="space-y-2 border-y border-editor-border py-2" data-color-presets>
        <label className="block">Color preset<select aria-label="Color grade preset" className="w-full bg-editor-bg" value={presetId} onChange={e=>{setPresetId(e.target.value);setPresetName(presets.find(p=>p.id===e.target.value)?.name||'');setPresetStatus('');setPresetError('');}}><option value="">Choose a saved preset…</option>{presets.map(p=><option key={p.id} value={p.id}>{p.name} · v{p.revision}</option>)}</select></label>
        <button aria-label="Apply color preset" disabled={busy||!id||!selectedPreset} onClick={()=>void applyPreset()} className="bg-editor-accent rounded px-2 py-1 disabled:opacity-40">Apply preset</button>
        <details><summary className="cursor-pointer text-editor-text-muted">Save / update preset</summary><div className="space-y-2 pt-2">
        <input aria-label="Color preset name" className="w-full min-w-0 bg-editor-bg border border-editor-border rounded px-2 py-1" maxLength={200} placeholder="Save current settings as…" value={presetName} onChange={e=>setPresetName(e.target.value)}/>
        <div className="flex flex-wrap gap-2"><button aria-label="Save new color preset" disabled={busy||!presetName.trim()} onClick={()=>void savePreset()} className="disabled:opacity-40">Save new preset</button><button aria-label="Update selected color preset" disabled={busy||!presetName.trim()||!selectedPreset} onClick={()=>void savePreset(true)} className="disabled:opacity-40">Update selected</button></div>
        </div></details>
        {presetStatus&&<p role="status" className="text-emerald-200">{presetStatus}</p>}{presetError&&<p role="alert" className="text-editor-danger break-words">{presetError}</p>}
      </div>
      <label className="block"><input type="checkbox" checked={grade.enabled} onChange={e=>update({...grade,enabled:e.target.checked})}/> Enable grade</label>
      {controls.map(([key,label,min,max,step])=><label className="inspector-color-row" key={key}><span>{key==='tint'?'Tint':label}</span><input aria-label={label} className="min-w-0" type="range" min={min} max={max} step={step} value={grade[key]} onInput={e=>update({...grade,[key]:Number(e.currentTarget.value)})}/><input aria-label={`${label} value`} className="bg-editor-bg" type="number" min={min} max={max} step={step} value={grade[key]} onInput={e=>{const n=Number(e.currentTarget.value);if(Number.isFinite(n)&&n>=min&&n<=max)update({...grade,[key]:n});}}/></label>)}
      <label className="block">Source area<select aria-label="Grade mask" className="w-full bg-editor-bg" value={grade.mask?.shape||'none'} onChange={e=>update({...grade,mask:e.target.value==='none'?null:{shape:e.target.value as 'ellipse'|'rectangle',x:.5,y:.5,width:.5,height:.5,feather:.1,invert:false}})}><option value="none">Whole source image</option><option value="rectangle">Soft rectangle</option><option value="ellipse">Soft ellipse</option></select></label>
      {grade.mask&&<><div className="grid grid-cols-2 gap-2">{(['x','y','width','height','feather'] as const).map(key=><label key={key}>{key}<input aria-label={`Grade mask ${key}`} className="w-full bg-editor-bg" type="number" min={key==='width'||key==='height'?.001:0} max={key==='width'||key==='height'?2:1} step={.01} value={grade.mask![key]} onChange={e=>{const n=Number(e.target.value),min=key==='width'||key==='height'?.001:0,max=key==='width'||key==='height'?2:1;if(Number.isFinite(n)&&n>=min&&n<=max)update({...grade,mask:{...grade.mask!,[key]:n}});}}/></label>)}</div><label><input type="checkbox" checked={grade.mask.invert} onChange={e=>update({...grade,mask:{...grade.mask!,invert:e.target.checked}})}/> Adjust outside this area</label></>}
      <div className="flex flex-wrap gap-2"><button disabled={busy||!id} onClick={()=>void save()} className="bg-editor-accent rounded px-2 py-1">Apply grade</button><button onClick={()=>{setGrade(normalizeColorGrade(effective));useCompositionStore.setState({colorPreview:null});}}>Cancel</button><button onClick={()=>setCopied(structuredClone(grade))}>Copy</button><button disabled={!copied} onClick={()=>copied&&update(structuredClone(copied))}>Paste</button><button disabled={busy||!id} onClick={()=>void save(true)}>Reset / inherit</button></div>
    </div>
  </details>;
}
