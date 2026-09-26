import { useEditorStore } from '../store/editorStore';
import type { ProjectSnapshot } from '../types/project';

let activeProjectId: string | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSave: Promise<unknown> = Promise.resolve();
let reportStatus: (status: 'saving' | 'saved' | 'error') => void = () => {};

export function getActiveProjectId() {
  return activeProjectId;
}

export function setActiveProjectId(id: string | null) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  activeProjectId = id;
}

export function getProjectSnapshot(): ProjectSnapshot {
  const state = useEditorStore.getState();
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
  };
}

export function saveCurrentProject(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  const id = activeProjectId;
  const api = window.electronAPI;
  if (!id || !api) return Promise.resolve();
  const snapshot = getProjectSnapshot();
  reportStatus('saving');
  const job = pendingSave.then(() => api.saveManagedProject(id, snapshot));
  pendingSave = job.catch(() => {});
  return job.then(() => reportStatus('saved')).catch((error) => {
    reportStatus('error');
    throw error;
  });
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
    if (!activeProjectId) return;
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
    if (changed || moved) {
      lastPlayhead = state.currentTime;
      scheduleProjectSave();
    }
  });
  const saveBeforeUnload = () => {
    if (!activeProjectId || !window.electronAPI) return;
    const result = window.electronAPI.saveManagedProjectSync(activeProjectId, getProjectSnapshot());
    if (!result.ok) console.error('Final project save failed:', result.error);
  };
  window.addEventListener('beforeunload', saveBeforeUnload);
  return () => {
    unsubscribe();
    window.removeEventListener('beforeunload', saveBeforeUnload);
    reportStatus = () => {};
  };
}
