import { useEditorStore } from '../store/editorStore';
import { useAIStore } from '../store/aiStore';
import type { ProjectSnapshot, ProjectFile } from '../types/project';
import { useCompositionStore } from '../store/compositionStore';
import type { Operation } from '../composition/types';

let activeProjectId: string | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSave: Promise<unknown> = Promise.resolve();
let reportStatus: (status: 'saving' | 'saved' | 'error') => void = () => {};
let baseline:ProjectSnapshot|null=null;
let applyingAck=false;
const dirty=new Set<keyof ProjectSnapshot>();
const snapshotKeys=['words','segments','deletedRanges','soundEvents','mediaItems','chatMessages','language','playhead','clips','mediaFolders','studioSoundEnabled','aiSettings','narration'] as const;

export function getActiveProjectId() {
  return activeProjectId;
}

export function setActiveProjectId(id: string | null,document?:ProjectFile) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  activeProjectId = id;
  baseline=document ? Object.fromEntries(snapshotKeys.map(key=>[key,document[key]])) as ProjectSnapshot : null;
  dirty.clear();
}

export function acknowledgeProject(ack:{revision:number;document:ProjectFile}) {
  if(ack.document.id!==activeProjectId)return;
  const current=getProjectSnapshot(),patch:Record<string,unknown>={};
  applyingAck=true;
  try{
    for(const key of snapshotKeys){
      const same=JSON.stringify(current[key])===JSON.stringify(ack.document[key]);
      if(!same&&!dirty.has(key)&&key!=='playhead'&&key!=='aiSettings'&&(ack.document[key]!==undefined||key==='narration'))patch[key]=ack.document[key];
      if(same)dirty.delete(key);
    }
    useEditorStore.setState(patch);
    if(!dirty.has('aiSettings')&&ack.document.aiSettings)useAIStore.setState(ack.document.aiSettings);
    if(ack.document.processing)useEditorStore.setState({processing:JSON.stringify(useEditorStore.getState().processing)===JSON.stringify(ack.document.processing)?useEditorStore.getState().processing:ack.document.processing,isTranscribing:['queued','running'].includes(ack.document.processing.status)&&!ack.document.words.length,transcriptionProgress:ack.document.processing.progress});
    if(ack.document.videoPath!==useEditorStore.getState().videoPath){const time=useEditorStore.getState().currentTime,duration=Math.max(0,...(ack.document.clips||[]).map(c=>c.start+c.duration));useEditorStore.getState().refreshVideo(ack.document.videoPath,duration);useEditorStore.getState().setCurrentTime(Math.min(time,duration));}
    if(ack.document.composition)useCompositionStore.getState().acknowledge(ack.revision,ack.document.composition);
    baseline=Object.fromEntries(snapshotKeys.map(key=>[key,ack.document[key]])) as ProjectSnapshot;
  }finally{applyingAck=false;}
}

export function getProjectSnapshot(): ProjectSnapshot {
  const state = useEditorStore.getState();
  const ai = useAIStore.getState();
  return {
    words: state.words,
    segments: state.segments,
    deletedRanges: state.deletedRanges,
    soundEvents: state.soundEvents,
    mediaItems: state.mediaItems,
    chatMessages: state.chatMessages,
    language: state.language,
    playhead: state.currentTime,
    clips: state.clips,
    mediaFolders: state.mediaFolders,
    studioSoundEnabled: state.studioSoundEnabled,
    aiSettings: { editingInstructions: ai.editingInstructions,
      mediaInstructions: ai.mediaInstructions, customFillerWords: ai.customFillerWords },
    narration:state.narration,
  };
}

export function saveCurrentProject(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  const id = activeProjectId;
  const api = window.electronAPI;
  if (!id || !api) return Promise.resolve();
  const snapshot=getProjectSnapshot(),requestedFields=new Set(dirty);
  reportStatus('saving');
  const job = pendingSave.then(async()=>{
    if(id!==activeProjectId)return;
    if(!baseline){const document=await api.getProjectDocument(id);baseline=Object.fromEntries(snapshotKeys.map(key=>[key,document[key]])) as ProjectSnapshot;useCompositionStore.getState().acknowledge(document.revision||0,document.composition!);}
    const changes:Partial<ProjectSnapshot>={};
    for(const key of snapshotKeys)if(requestedFields.has(key)&&JSON.stringify(snapshot[key])!==JSON.stringify(baseline[key]))Object.assign(changes,{[key]:snapshot[key]});
    if(!Object.keys(changes).length)return;
    acknowledgeProject(await api.saveManagedProject(id,{revision:useCompositionStore.getState().revision,changes}));
  });
  pendingSave = job.catch(() => {});
  return job.then(() => reportStatus('saved')).catch((error) => {
    reportStatus('error');
    throw error;
  });
}

export async function commitComposition(operations:Operation[],label='Edit media',actor:'manual'|'ai'='manual',groupId?:string,documentChanges?:Partial<ProjectSnapshot>) {
  const saved=saveCurrentProject(),id=activeProjectId;
  const job=pendingSave.then(async()=>{
    await saved;
    const {projectId,revision}=useCompositionStore.getState();
    if(!projectId||projectId!==id||!window.electronAPI)throw new Error('Open a managed project to edit media');
    const ack=await window.electronAPI.commitProject({id:crypto.randomUUID(),projectId,baseRevision:revision,actor,label,groupId,operations,documentChanges});
    acknowledgeProject(ack);return ack;
  });
  pendingSave=job.catch(()=>{});return job;
}
export async function projectHistory(direction:'undo'|'redo') {
  const saved=saveCurrentProject(),id=activeProjectId;
  const job=pendingSave.then(async()=>{
    await saved;if(!id||id!==activeProjectId||!window.electronAPI)return;
    useCompositionStore.getState().setDraft(null);
    acknowledgeProject(await (direction==='undo'?window.electronAPI.undoProject(id):window.electronAPI.redoProject(id)));
  });
  pendingSave=job.catch(()=>{});return job;
}

export function scheduleProjectSave() {
  if (!activeProjectId || !window.electronAPI) return;
  reportStatus('saving');
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void saveCurrentProject().catch((error) => console.error('Autosave failed:', error));
  }, 800);
}

export async function copyProjectAsset(sourcePath: string): Promise<string> {
  if (!activeProjectId || !window.electronAPI) return sourcePath;
  return window.electronAPI.copyProjectAsset(activeProjectId, sourcePath);
}

export function attachProjectAutosave(onStatus: typeof reportStatus) {
  reportStatus = onStatus;
  let lastPlayhead = useEditorStore.getState().currentTime;
  const unsubscribe = useEditorStore.subscribe((state, previous) => {
    if (!activeProjectId||applyingAck) return;
    for(const key of snapshotKeys)if(key!=='aiSettings'&&key!=='playhead'&&state[key]!==previous[key])dirty.add(key);
    const changed = state.words !== previous.words
      || state.segments !== previous.segments
      || state.deletedRanges !== previous.deletedRanges
      || state.soundEvents !== previous.soundEvents
      || state.mediaItems !== previous.mediaItems
      || state.chatMessages !== previous.chatMessages
      || state.clips !== previous.clips
      || state.mediaFolders !== previous.mediaFolders
      || state.studioSoundEnabled !== previous.studioSoundEnabled
      || state.language !== previous.language;
    const moved = Math.abs(state.currentTime - lastPlayhead) >= 10;
    const editedTranscript=state.words!==previous.words||state.deletedRanges!==previous.deletedRanges
      ||state.soundEvents!==previous.soundEvents||state.narration!==previous.narration;
    if(editedTranscript){
      // Each direct edit gets its own history step, including an immediate undo
      // before the usual autosave delay has elapsed.
      void saveCurrentProject().catch(error=>console.error('Edit save failed:',error));
    }else if (changed || moved) {
      if(moved)dirty.add('playhead');
      lastPlayhead = state.currentTime;
      scheduleProjectSave();
    }
  });
  const unsubscribeAI = useAIStore.subscribe((state, previous) => {
    if(applyingAck)return;
    if (state.editingInstructions !== previous.editingInstructions
      || state.mediaInstructions !== previous.mediaInstructions
      || state.customFillerWords !== previous.customFillerWords){dirty.add('aiSettings');scheduleProjectSave();}
  });
  const unsubscribeDocument=window.electronAPI?.onProjectChanged(acknowledgeProject);
  const saveBeforeUnload = () => {
    if (!activeProjectId || !window.electronAPI) return;
    const snapshot=getProjectSnapshot(),changes:Partial<ProjectSnapshot>={};
    for(const key of dirty)Object.assign(changes,{[key]:snapshot[key]});
    if(!Object.keys(changes).length)return;
    const result = window.electronAPI.saveManagedProjectSync(activeProjectId,{revision:useCompositionStore.getState().revision,changes});
    if (!result.ok) console.error('Final project save failed:', result.error);
  };
  window.addEventListener('beforeunload', saveBeforeUnload);
  return () => {
    unsubscribe();
    unsubscribeAI();
    unsubscribeDocument?.();
    window.removeEventListener('beforeunload', saveBeforeUnload);
    reportStatus = () => {};
  };
}
