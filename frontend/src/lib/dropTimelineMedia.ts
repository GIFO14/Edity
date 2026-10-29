import {useCompositionStore} from '../store/compositionStore';
import {waitForJob} from '../composition/jobs';
import {droppedMediaKind,droppedElement} from '../composition/droppedMedia';
import type {Asset,Operation} from '../composition/types';
import {commitComposition} from './projectPersistence';

export async function dropTimelineMedia(files:File[],startUs:number,trackId:string|undefined,onProgress:(message:string)=>void){
  const api=window.electronAPI;if(!api)throw new Error('Open Edity to import local files');
  return importTimelinePaths(files.map(file=>({name:file.name,path:api.getPathForFile(file)})),startUs,trackId,onProgress,'Drop media onto timeline');
}

export async function importTimelinePaths(files:Array<{name:string;path:string}>,startUs:number,trackId:string|undefined,onProgress:(message:string)=>void,label='Paste media onto timeline'){
  const api=window.electronAPI,initial=useCompositionStore.getState(),projectId=initial.projectId;
  if(!api||!projectId||!initial.manifest)throw new Error('Open a ready project first');
  const paths=files.map(file=>({...file,kind:droppedMediaKind(file.name)}));
  const rejected=paths.filter(f=>!f.kind||!f.path),valid=paths.filter(f=>f.kind&&f.path);
  if(!valid.length)throw new Error('Drop local audio, video or image files onto the timeline');
  // Capture the destination project. Never commit an async import into another tab.
  const assertProject=()=>{const s=useCompositionStore.getState();if(s.projectId!==projectId||s.manifest?.durationUs!==initial.manifest?.durationUs||JSON.stringify(s.manifest?.segments)!==JSON.stringify(initial.manifest?.segments))throw new Error('Timeline changed during import. Imported resources remain in Media; drop again at the new position.');return s;};
  const operations:Operation[]=[],failures=rejected.map(f=>`${f.name}: unsupported file`);
  let cursor=startUs;
  for(const [index,file] of valid.entries()){
    assertProject();
    if(cursor>=initial.manifest.durationUs){failures.push(`${file.name}: no space after the end of the video`);continue;}
    try{
      onProgress(`Importing ${index+1}/${valid.length} · ${file.name}`);
      const job=await api.startJob({kind:'asset',projectId,payload:{path:file.path,kind:file.kind,provenance:{source:'local'}}});
      const completed=await waitForJob(job.id),asset=completed.result?.asset as Asset;
      const state=assertProject(),element=droppedElement(asset,cursor,initial.manifest.durationUs,state.document,trackId);
      element.order+=operations.length;operations.push({type:'add',element});
      cursor=element.placement.kind==='timeline'?element.placement.endUs:cursor;
    }catch(error){assertProject();failures.push(`${file.name}: ${String(error)}`);}
  }
  assertProject();
  if(operations.length){await commitComposition(operations,label);const last=operations.at(-1);if(last?.type==='add')useCompositionStore.getState().select(last.element.id);}
  if(failures.length)throw new Error(`${operations.length?`${operations.length} added. `:''}${failures.join('; ')}`);
}
