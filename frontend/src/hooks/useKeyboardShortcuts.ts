import { useEffect, useRef } from 'react';
import { useEditorStore } from '../store/editorStore';
import { getActiveProjectId, saveCurrentProject, projectHistory,commitComposition,acknowledgeProject } from '../lib/projectPersistence';
import {useCompositionStore} from '../store/compositionStore';
import { seekSourceTime, sourceTimeAt } from '../lib/playbackTime';
import {sourceToEdit,editToSource} from '../composition/timeMap';

export function useKeyboardShortcuts() {
  const deleteSelectedWords = useEditorStore((s) => s.deleteSelectedWords);
  const selectedWordIndices = useEditorStore((s) => s.selectedWordIndices);

  const playbackRateRef = useRef(1);

  useEffect(() => {
    const getVideo = (): HTMLVideoElement | null => document.querySelector('video');
    const shiftEdited=(video:HTMLVideoElement,delta:number)=>{const manifest=useCompositionStore.getState().manifest;if(manifest){const current=sourceToEdit(manifest,Math.round(sourceTimeAt(video)*1e6))??0,target=editToSource(manifest,Math.max(0,Math.min(manifest.durationUs-1,current+delta*1e6)));if(target)seekSourceTime(video,target.globalSourceUs/1e6);}else seekSourceTime(video,Math.max(0,sourceTimeAt(video)+delta));};

    const handler = (e: KeyboardEvent) => {
      if(e.defaultPrevented)return;
      if(e.key==='Escape'){useCompositionStore.getState().setDraft(null);return;}
      const target = e.target as HTMLElement;
      if (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

      // Shift commonly changes event.key to uppercase "Z". Handle both
      // spellings, and surface failed history requests rather than dropping them.
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){
        e.preventDefault();e.stopPropagation();
        const direction=e.shiftKey?'redo':'undo';
        if(getActiveProjectId())void projectHistory(direction).catch(error=>useCompositionStore.setState({error:String(error)}));
        else useEditorStore.temporal.getState()[direction]();
        return;
      }

      const video = getVideo();
      if((e.ctrlKey||e.metaKey)&&['x','c','v'].includes(e.key.toLowerCase())&&window.electronAPI&&getActiveProjectId()){
        const state=useEditorStore.getState(),ids=state.selectedWordIndices.flatMap(i=>state.words[i]?.id?[state.words[i].id!]:[]),key=e.key.toLowerCase();
        if(key==='c'&&ids.length){e.preventDefault();void window.electronAPI.copyNarrationText(getActiveProjectId()!,ids).catch(error=>useCompositionStore.setState({error:String(error)}));return;}
        if(key==='x'&&ids.length||key==='v'&&state.narration?.cutClipboard.length){e.preventDefault();void (async()=>{await saveCurrentProject();const ack=await window.electronAPI!.editNarration(key==='x'?'cut':'paste',{projectId:getActiveProjectId()!,expectedRevision:useCompositionStore.getState().revision,idempotencyKey:crypto.randomUUID(),wordIds:key==='x'?ids:undefined,beforeWordId:key==='v'?ids[0]:undefined,position:ids.length?undefined:'end'});acknowledgeProject(ack);useEditorStore.getState().setSelectedWordIndices([]);})().catch(error=>useCompositionStore.setState({error:String(error)}));return;}
      }

      switch (true) {
        // --- Delete / Backspace: mark selected words ---
        case e.key === 'Delete' || e.key === 'Backspace': {
          if (selectedWordIndices.length > 0) {
            e.preventDefault();
            deleteSelectedWords();
          }else if(useCompositionStore.getState().selectedId&&useCompositionStore.getState().selectedId!=='base'){const id=useCompositionStore.getState().selectedId!;e.preventDefault();void commitComposition([{type:'remove',id}],'Delete element').then(()=>useCompositionStore.getState().select(null));
          }
          return;
        }

        // --- Space: play / pause ---
        case e.key === ' ' && !e.ctrlKey: {
          e.preventDefault();
          if (video) {
            if (video.paused) video.play();
            else video.pause();
          }
          return;
        }

        // --- J: reverse / slow down ---
        case e.key === 'j' || e.key === 'J': {
          e.preventDefault();
          if (video) {
            playbackRateRef.current = Math.max(-2, playbackRateRef.current - 0.5);
            if (playbackRateRef.current < 0) {
              // HTML5 video doesn't support negative rates natively; step back
              seekSourceTime(video, Math.max(0, sourceTimeAt(video) - 2));
            } else {
              video.playbackRate = playbackRateRef.current;
              if (video.paused) video.play();
            }
          }
          return;
        }

        // --- K: pause ---
        case e.key === 'k' || e.key === 'K': {
          e.preventDefault();
          if (video) {
            video.pause();
            playbackRateRef.current = 1;
          }
          return;
        }

        // --- L: forward / speed up ---
        case e.key === 'l' || e.key === 'L': {
          e.preventDefault();
          if (video) {
            playbackRateRef.current = Math.min(4, playbackRateRef.current + 0.5);
            video.playbackRate = Math.max(0.25, playbackRateRef.current);
            if (video.paused) video.play();
          }
          return;
        }

        // --- Arrow Left: seek back 5s ---
        case e.key === 'ArrowLeft' && !e.ctrlKey: {
          e.preventDefault();
          if (video) shiftEdited(video,-5);
          return;
        }

        // --- Arrow Right: seek forward 5s ---
        case e.key === 'ArrowRight' && !e.ctrlKey: {
          e.preventDefault();
          if (video) shiftEdited(video,5);
          return;
        }

        // --- [ mark in-point (home) ---
        case e.key === '[': {
          e.preventDefault();
          if (video) seekSourceTime(video,(useCompositionStore.getState().manifest?.segments[0]?.globalSourceStartUs||0)/1e6);
          return;
        }

        // --- ] mark out-point (end) ---
        case e.key === ']': {
          e.preventDefault();
          if (video){const manifest=useCompositionStore.getState().manifest,target=manifest?editToSource(manifest,Math.max(0,manifest.durationUs-1)):null;seekSourceTime(video,target?target.globalSourceUs/1e6:useEditorStore.getState().duration);}
          return;
        }

        // --- Ctrl+S: save project ---
        case e.key === 's' && (e.ctrlKey || e.metaKey): {
          e.preventDefault();
          if (getActiveProjectId()) {
            void saveCurrentProject().catch((error) => console.error('Failed to save project:', error));
          } else {
            void saveProject();
          }
          return;
        }

        // --- Ctrl+E: export ---
        case e.key === 'e' && (e.ctrlKey || e.metaKey): {
          e.preventDefault();
          // Trigger export panel via DOM click
          const exportBtn = document.querySelector('[title="Export"]') as HTMLButtonElement;
          if (exportBtn) exportBtn.click();
          return;
        }

        // --- ?: show shortcut cheatsheet ---
        case e.key === '?' || (e.key === '/' && e.shiftKey): {
          e.preventDefault();
          toggleCheatsheet();
          return;
        }

        default:
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [deleteSelectedWords, selectedWordIndices]);
}

async function saveProject() {
  const state = useEditorStore.getState();
  if (!state.videoPath || state.words.length === 0) return;

  try {
    const projectData = {
      version: 1,
      videoPath: state.videoPath,
      words: state.words,
      segments: state.segments,
      deletedRanges: state.deletedRanges,
      soundEvents: state.soundEvents,
      mediaItems: state.mediaItems,
      chatMessages: state.chatMessages,
      language: state.language,
      narration: state.narration,
      studioSoundEnabled: state.studioSoundEnabled,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    };

    const outputPath = await window.electronAPI?.saveFile({
      defaultPath: state.videoPath.replace(/\.[^.]+$/, '.edity'),
      filters: [{ name: 'Edity Project', extensions: ['edity'] }],
    });

    if (outputPath) {
      if (window.electronAPI?.writeFile) {
        await window.electronAPI.writeFile(outputPath, JSON.stringify(projectData, null, 2));
      } else {
        const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = outputPath.split(/[\\/]/).pop() || 'project.edity';
        a.click();
        URL.revokeObjectURL(url);
      }
    }
  } catch (err) {
    console.error('Failed to save project:', err);
  }
}

let cheatsheetVisible = false;

function toggleCheatsheet() {
  const existing = document.getElementById('keyboard-cheatsheet');
  if (existing) {
    existing.remove();
    cheatsheetVisible = false;
    return;
  }

  cheatsheetVisible = true;
  const overlay = document.createElement('div');
  overlay.id = 'keyboard-cheatsheet';
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);';
  overlay.onclick = () => {
    overlay.remove();
    cheatsheetVisible = false;
  };

  const shortcuts = [
    ['Space', 'Play / Pause'],
    ['J', 'Reverse / Slow down'],
    ['K', 'Pause'],
    ['L', 'Forward / Speed up'],
    ['\u2190 / \u2192', 'Seek \u00b15 seconds'],
    ['Delete', 'Mark selected words for removal'],
    ['Ctrl+Z', 'Undo'],
    ['Ctrl+Shift+Z', 'Redo'],
    ['Ctrl+S', 'Save project'],
    ['Ctrl+E', 'Export'],
    ['?', 'This cheatsheet'],
  ];

  const rows = shortcuts
    .map(
      ([key, desc]) =>
        `<tr><td style="padding:6px 16px 6px 0;font-family:monospace;color:#818cf8;font-weight:600">${key}</td><td style="padding:6px 0;color:#e2e8f0">${desc}</td></tr>`,
    )
    .join('');

  overlay.innerHTML = `<div style="background:#1a1d27;border:1px solid #2a2d3a;border-radius:12px;padding:24px 32px;max-width:400px;" onclick="event.stopPropagation()">
    <h3 style="margin:0 0 16px;font-size:14px;font-weight:600;color:#e2e8f0">Keyboard Shortcuts</h3>
    <table style="font-size:13px">${rows}</table>
    <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;text-align:center">Press ? or click outside to close</p>
  </div>`;

  document.body.appendChild(overlay);
}
