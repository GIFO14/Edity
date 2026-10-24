import {useState} from 'react';
import {useEditorStore} from '../store/editorStore';
import {getActiveProjectId,saveCurrentProject,acknowledgeProject} from '../lib/projectPersistence';
import {useCompositionStore} from '../store/compositionStore';
export default function NarrationControls(){
  const words=useEditorStore(s=>s.words),selection=useEditorStore(s=>s.selectedWordIndices),narration=useEditorStore(s=>s.narration);const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const ids=selection.flatMap(i=>words[i]?.id?[words[i].id!]:[]),projectId=getActiveProjectId();
  async function edit(kind:'move'|'cut'|'paste',position?:'start'|'end',beforeWordId?:string){if(!projectId||!window.electronAPI)return;setBusy(true);setError('');try{await saveCurrentProject();const result=await window.electronAPI.editNarration(kind,{projectId,expectedRevision:useCompositionStore.getState().revision,idempotencyKey:crypto.randomUUID(),wordIds:kind==='paste'?undefined:ids,position,beforeWordId});acknowledgeProject(result);useEditorStore.getState().setSelectedWordIndices([]);}catch(e){setError(String(e));}finally{setBusy(false);}}
  async function copy(){if(!projectId)return;try{await window.electronAPI?.copyNarrationText(projectId,ids);}catch(e){setError(String(e));}}
  if(!ids.length&&!narration?.cutClipboard.length)return null;
  return <div className="px-4 py-2 border-b border-editor-border text-xs shrink-0 space-y-1" aria-label="Arrange narration"><div className="flex flex-wrap gap-2 items-center"><span className="text-editor-text-muted">Narration</span>{ids.length>0&&<><button disabled={busy} onClick={()=>void edit('move','start')}>Move to beginning</button><button disabled={busy} onClick={()=>void edit('move','end')}>Move to end</button><button disabled={busy} onClick={()=>void edit('cut')}>Cut speech</button><button disabled={busy} onClick={()=>void copy()}>Copy text</button></>}{!!narration?.cutClipboard.length&&<><button disabled={busy||!ids.length} onClick={()=>void edit('paste',undefined,ids[0])}>Paste before selection</button><button disabled={busy} onClick={()=>void edit('paste','end')}>Paste at end</button><span className="text-editor-text-muted">Cut speech is parked until pasted or undone.</span></>}</div>{error&&<p role="alert" className="text-editor-danger">{error}</p>}</div>;
}
