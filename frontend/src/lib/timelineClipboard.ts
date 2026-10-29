import {useCompositionStore} from '../store/compositionStore';
import {useEditorStore} from '../store/editorStore';
import {compileComposition} from '../composition/compiler';
import {pastedElement,pastedText} from '../composition/timelineClipboard';
import {commitComposition,saveCurrentProject} from './projectPersistence';
import {importTimelinePaths} from './dropTimelineMedia';
import {waitForJob} from '../composition/jobs';
import type {Asset} from '../composition/types';

export async function copyTimelineSelection(elementId?:string){
  const api=window.electronAPI,projectId=useCompositionStore.getState().projectId;
  if(!api||!projectId)throw new Error('Open a ready project first');
  await saveCurrentProject();
  const state=useCompositionStore.getState(),id=elementId||state.selectedId;
  if(state.projectId!==projectId||!state.manifest||!id||id==='base')throw new Error('Select an additional timeline element to copy');
  const element=compileComposition(state.document,state.manifest,useEditorStore.getState().words).elements.find(e=>e.id===id&&!e.suppressed);
  if(!element)throw new Error('This element is not visible in the timeline');
  return api.copyTimelineElement({projectId,elementId:id,expectedRevision:state.revision,
    spans:(element.activeSpans||[{startUs:element.startUs,endUs:element.endUs}]).map(({startUs,endUs})=>({startUs,endUs}))});
}

export async function pasteTimelineClipboard(startUs:number,trackId:string|undefined,onProgress:(message:string)=>void){
  const api=window.electronAPI,initial=useCompositionStore.getState(),projectId=initial.projectId;
  if(!api||!projectId||!initial.manifest)throw new Error('Open a ready project first');
  const assertProject=()=>{const state=useCompositionStore.getState();if(state.projectId!==projectId||JSON.stringify(state.manifest?.segments)!==JSON.stringify(initial.manifest?.segments))throw new Error('Timeline changed during paste. Paste again at the new position.');return state;};
  const clipboard=await api.readTimelineClipboard(projectId);assertProject();
  if(clipboard.kind==='empty')throw new Error('Copy a timeline element, local media file, image or text first');
  if(clipboard.kind==='files')return importTimelinePaths(clipboard.files,startUs,trackId,onProgress);
  let element;
  if(clipboard.kind==='text')element=pastedText(clipboard.text,assertProject().document,startUs,initial.manifest.durationUs);
  else{
    const {payload}=clipboard,assetIds:Record<string,string>={};
    for(const asset of Object.values(payload.assets)){
      const state=assertProject(),existing=state.document.assets[asset.id];
      if(payload.sourceProjectId===projectId&&existing?.hash===asset.hash){assetIds[asset.id]=asset.id;continue;}
      onProgress(`Importing copied resource · ${asset.name}`);
      const job=await api.startJob({kind:'asset',projectId,payload:{path:asset.path,kind:asset.kind,provenance:{source:'local'}}});
      const prepared=(await waitForJob(job.id)).result?.asset as Asset;assertProject();
      if(!prepared||prepared.status!=='ready')throw new Error(`Copied resource is unavailable: ${asset.name}`);
      assetIds[asset.id]=prepared.id;
    }
    element=pastedElement(payload,assertProject().document,startUs,initial.manifest.durationUs,assetIds,trackId);
  }
  assertProject();await commitComposition([{type:'add',element}],'Paste timeline element');
  if(useCompositionStore.getState().projectId===projectId)useCompositionStore.getState().select(element.id);
}
