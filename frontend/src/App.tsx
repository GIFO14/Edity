import { useEffect, useState, useRef } from 'react';
import { useEditorStore } from './store/editorStore';
import { useAIStore } from './store/aiStore';
import VideoPlayer from './components/VideoPlayer';
import TranscriptEditor from './components/TranscriptEditor';
import WaveformTimeline from './components/WaveformTimeline';
import AIPanel from './components/AIPanel';
import ExportDialog from './components/ExportDialog';
import SettingsPanel from './components/SettingsPanel';
import MediaPanel from './components/MediaPanel';
import AudioPanel from './components/AudioPanel';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { attachProjectAutosave, getActiveProjectId, getProjectSnapshot,
  saveCurrentProject, setActiveProjectId } from './lib/projectPersistence';
import { cleanTranscript } from './lib/transcriptCleanup';
import { scanSoundEvents } from './lib/soundEvents';
import { removeSilence } from './lib/silenceRemoval';
import type { ProjectFile, ProjectSummary, ProjectClip, TranscriptionResult } from './types/project';
import {
  Film,
  FolderOpen,
  Settings,
  Sparkles,
  Download,
  Loader2,
  FolderSearch,
  FileInput,
  MoreHorizontal,
  AudioLines,
} from 'lucide-react';

const IS_ELECTRON = !!window.electronAPI;

type Panel = 'ai' | 'media' | 'audio' | 'settings' | 'export' | null;
type SilencePreset = 'personal' | 'gaming' | 'custom';
type ProcessingPhase = 'transcription' | 'cleanup' | 'sounds';
type ImportProgress = { stage: string; stageProgress: number; overallProgress: number };

export default function App() {
  const {
    videoPath,
    words,
    isTranscribing,
    transcriptionProgress,
    loadVideo,
    setBackendUrl,
    setTranscription,
    addClipTranscription,
    replaceSoundEvents,
    updateClips,
    removeClipData,
    releaseVideo,
    refreshVideo,
    setTranscribing,
    backendUrl,
  } = useEditorStore();

  const [activePanel, setActivePanel] = useState<Panel>(null);
  const [manualPath, setManualPath] = useState('');
  const [transcriptionEngine, setTranscriptionEngine] = useState<'crisper' | 'whisperx'>('crisper');
  const [transcriptionModel, setTranscriptionModel] = useState('medium');
  const [transcriptionLanguage, setTranscriptionLanguage] = useState('ca');
  const [silencePreset, setSilencePreset] = useState<SilencePreset>(() =>
    (localStorage.getItem('edity-silence-preset') as SilencePreset) || 'personal');
  const [customMargin, setCustomMargin] = useState(() => localStorage.getItem('edity-custom-margin') || '0.1');
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [transcriptionStatus, setTranscriptionStatus] = useState('');
  const [transcriptionError, setTranscriptionError] = useState('');
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsDirectory, setProjectsDirectory] = useState('');
  const [showProjects, setShowProjects] = useState(false);
  const [showLibrarySettings, setShowLibrarySettings] = useState(false);
  const [projectError, setProjectError] = useState('');
  const [projectBusy, setProjectBusy] = useState(false);
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [projectActionMessage, setProjectActionMessage] = useState('');
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'error'>('saved');
  const [clipBusy, setClipBusy] = useState(false);
  const [clipStatus, setClipStatus] = useState('');
  const [clipProgress, setClipProgress] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useKeyboardShortcuts();

  useEffect(() => attachProjectAutosave(setSaveStatus), []);

  useEffect(() => {
    if (!IS_ELECTRON) return;
    let cancelled = false;
    const api = window.electronAPI!;
    const initialize = async () => {
      setBackendUrl(await api.getBackendUrl());
      const [available, directory] = await Promise.all([api.listProjects(), api.getProjectsDirectory()]);
      if (cancelled) return;
      setProjects(available);
      setProjectsDirectory(directory);

      if (!useAIStore.getState().editingInstructionsMigrated) {
        const lastId = localStorage.getItem('edity-last-project');
        const ordered = [...available].sort((a, b) =>
          Number(b.id === lastId) - Number(a.id === lastId));
        let legacyInstructions = '';
        for (const summary of ordered) {
          try {
            const legacyProject = await api.openManagedProject(summary.id);
            if (legacyProject.editingInstructions?.trim()) {
              legacyInstructions = legacyProject.editingInstructions;
              break;
            }
          } catch { /* An unavailable old project must not block startup. */ }
        }
        useAIStore.getState().migrateEditingInstructions(
          legacyInstructions || localStorage.getItem('edity-edit-instructions') || '');
      }

      const current = useEditorStore.getState();
      if (current.videoPath) {
        // A video left open by the previous app version becomes a managed project.
        if (getActiveProjectId()) return;
        const created = await api.createManagedProject(current.videoPath, getProjectSnapshot());
        await api.saveManagedProject(created.id!, getProjectSnapshot());
        const latest = await api.openManagedProject(created.id!);
        if (cancelled) return;
        activateProject(latest);
        setProjects(await api.listProjects());
        return;
      }

      const lastId = localStorage.getItem('edity-last-project');
      const recent = available.find((project) => project.id === lastId && !project.missingVideo)
        || available.find((project) => !project.missingVideo);
      if (recent) {
        const project = await api.openManagedProject(recent.id);
        if (!cancelled) activateProject(project);
      }
    };
    void initialize().catch((error) => {
      console.error('Project startup failed:', error);
      if (!cancelled) setProjectError(String(error));
    });
    return () => { cancelled = true; };
  }, [setBackendUrl]);

  const activateProject = (project: ProjectFile) => {
    if (!project.id) throw new Error('Project has no ID');
    const clips = project.clips?.length ? project.clips : [{ id: `legacy_${project.id}`,
      name: (project.sourceVideoPath || project.videoPath).split(/[\\/]/).pop() || 'Clip 1',
      path: project.videoPath, sourcePath: project.sourceVideoPath, start: 0, duration: 0 }];
    setActiveProjectId(project.id);
    useEditorStore.getState().loadProject({ ...project,
      clips,
      mediaFolders: project.mediaFolders || useAIStore.getState().mediaFolders });
    useEditorStore.getState().setCurrentTime(project.playhead || 0);
    localStorage.setItem('edity-last-project', project.id);
    setSaveStatus('saved');
    setProjectError('');
    setShowProjects(false);
  };

  const refreshProjects = async () => {
    if (IS_ELECTRON) setProjects(await window.electronAPI!.listProjects());
  };

  const openManagedProject = async (id: string) => {
    if (!IS_ELECTRON) return;
    setProjectBusy(true);
    setProjectError('');
    try {
      await saveCurrentProject();
      const project = await window.electronAPI!.openManagedProject(id);
      const summary = projects.find((item) => item.id === id);
      if (summary?.missingVideo) throw new Error('The video file is missing from this project.');
      activateProject(project);
    } catch (error) {
      setProjectError(String(error));
    } finally {
      setProjectBusy(false);
    }
  };

  const showProjectLibrary = async () => {
    try {
      await saveCurrentProject();
      await refreshProjects();
      setShowProjects(true);
    } catch (error) {
      setProjectError(String(error));
    }
  };

  const handleLoadProject = async () => {
    if (!IS_ELECTRON) return;
    setProjectBusy(true);
    try {
      await saveCurrentProject();
      const projectPath = await window.electronAPI!.openProject();
      if (!projectPath) return;
      const project = await window.electronAPI!.importManagedProject(projectPath);
      activateProject(project);
      await refreshProjects();
    } catch (err) {
      console.error('Failed to load project:', err);
      setProjectError(String(err));
    } finally {
      setProjectBusy(false);
    }
  };

  const renameProject = async (id: string) => {
    setProjectBusy(true);
    setProjectError('');
    try {
      await saveCurrentProject();
      await window.electronAPI!.renameManagedProject(id, renameDraft);
      await refreshProjects();
      setRenamingId(null);
      setOpenActionsId(null);
      setProjectActionMessage('Project renamed.');
    } catch (error) {
      setProjectError(String(error));
    } finally {
      setProjectBusy(false);
    }
  };

  const duplicateProject = async (id: string) => {
    setProjectBusy(true);
    setProjectError('');
    setProjectActionMessage('');
    try {
      await saveCurrentProject();
      await window.electronAPI!.duplicateManagedProject(id);
      await refreshProjects();
      setOpenActionsId(null);
      setProjectActionMessage('Project duplicated.');
    } catch (error) {
      setProjectError(String(error));
    } finally {
      setProjectBusy(false);
    }
  };

  const exportProjectFile = async (project: ProjectSummary) => {
    setProjectBusy(true);
    setProjectError('');
    setProjectActionMessage('');
    try {
      await saveCurrentProject();
      const safeTitle = project.title.replace(/[<>:"/\\|?*]/g, '_');
      const exportFolder = projectsDirectory.replace(/[\\/]+Projects[\\/]?$/i, '');
      const separator = projectsDirectory.includes('\\') ? '\\' : '/';
      const destination = await window.electronAPI!.saveFile({
        defaultPath: exportFolder ? `${exportFolder}${separator}${safeTitle}.edity` : `${safeTitle}.edity`,
        filters: [{ name: 'Edity Project', extensions: ['edity'] }],
      });
      if (!destination) return;
      await window.electronAPI!.exportManagedProject(project.id, destination);
      setOpenActionsId(null);
      setProjectActionMessage(`Project exported to ${destination}`);
    } catch (error) {
      setProjectError(String(error));
    } finally {
      setProjectBusy(false);
    }
  };

  const deleteProject = async (project: ProjectSummary) => {
    const trashName = navigator.platform.toLowerCase().includes('mac') ? 'Trash' : 'Recycle Bin';
    if (!window.confirm(`Move “${project.title}” and its managed video and media files to the ${trashName}? The original recording outside the project folder stays intact.`)) return;
    setProjectBusy(true);
    setProjectError('');
    setProjectActionMessage('');
    const wasActive = getActiveProjectId() === project.id;
    const activeState = wasActive ? useEditorStore.getState() : null;
    try {
      await saveCurrentProject();
      if (wasActive) {
        releaseVideo();
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      try {
        await fetch(`${backendUrl}/preview/cancel`, { method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ video_path: project.videoPath }) });
      } catch { /* Deletion still works if the preview service is unavailable. */ }
      if (wasActive) {
        setActiveProjectId(null);
        useEditorStore.getState().reset();
      }
      const deletion = await window.electronAPI!.deleteManagedProject(project.id);
      if (wasActive) {
        localStorage.removeItem('edity-last-project');
      }
      await refreshProjects();
      setOpenActionsId(null);
      setProjectActionMessage(deletion?.pending
        ? `Project removed. The files will move to the ${trashName} when the video handle closes.`
        : 'Project deleted.');
    } catch (error) {
      if (wasActive && activeState) {
        useEditorStore.setState(activeState);
        setActiveProjectId(project.id);
      }
      setProjectError(String(error));
    } finally {
      setProjectBusy(false);
    }
  };

  const handleOpenFile = async () => {
    if (IS_ELECTRON) {
      const path = await window.electronAPI!.openFile();
      if (path) {
        await importVideo(path);
      }
    } else {
      // Browser: use the manual path input
      const path = manualPath.trim();
      if (path) {
        await importVideo(path);
      }
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const path = manualPath.trim();
    if (!path) return;
    await importVideo(path);
  };

  const importVideo = async (path: string) => {
    setIsImporting(true);
    setImportProgress({ stage: 'Preparing import', stageProgress: 0, overallProgress: 0 });
    const reportImport = (stage: string, stageProgress: number, base: number, span: number) => {
      const progress = Math.max(0, Math.min(100, Math.round(stageProgress)));
      setImportProgress({ stage, stageProgress: progress,
        overallProgress: Math.max(0, Math.min(100, Math.round(base + span * progress / 100))) });
    };
    try {
      if (IS_ELECTRON) {
        const existing = projects.find((item) => item.videoPath.toLowerCase() === path.toLowerCase()
          || item.sourceVideoPath?.toLowerCase() === path.toLowerCase());
        if (existing) {
          reportImport('Opening existing project', 100, 0, 100);
          await openManagedProject(existing.id);
          return;
        }
        await saveCurrentProject();
      }
      let sourcePath = path;
      // A recording produced by an earlier import can be opened again after a restart.
      if (!/_(?:edity|cutscript)_silence(?:_\d+)?\.[^\\/.]+$/i.test(path)) {
        const data = await removeSilence(backendUrl, {
          file_path: path, preset: silencePreset,
          custom_margin: silencePreset === 'custom' ? Number(customMargin) : undefined,
        }, (progress) => {
          setImportProgress({ stage: progress.message, stageProgress: progress.phase_progress,
            overallProgress: Math.max(0, Math.min(35, Math.round(35 * progress.progress / 100))) });
        });
        sourcePath = data.output_path;
      } else {
        reportImport('Silence removal already completed', 100, 0, 35);
      }
      if (IS_ELECTRON) {
        reportImport('Copying video into the project', 0, 35, 10);
        const project = await window.electronAPI!.createManagedProject(sourcePath, {
          mediaFolders: useAIStore.getState().mediaFolders,
        }, (progress) => {
          reportImport('Copying video into the project', progress.progress, 35, 10);
        });
        activateProject(project);
        await refreshProjects();
      } else {
        loadVideo(sourcePath);
      }
      // Transcribe the source file so a prior transcription cache remains usable.
      await transcribeVideo(sourcePath, undefined, (phase, progress, stage) => {
        const range = phase === 'transcription' ? [45, 40] : phase === 'cleanup' ? [85, 8] : [93, 7];
        reportImport(stage, progress, range[0], range[1]);
      });
      setImportProgress({ stage: 'Import complete', stageProgress: 100, overallProgress: 100 });
    } catch (err) {
      alert(`Import failed: ${err}`);
    } finally {
      setIsImporting(false);
      setTimeout(() => setImportProgress(null), 1500);
    }
  };

  const updateSilencePreset = (preset: SilencePreset) => {
    setSilencePreset(preset);
    localStorage.setItem('edity-silence-preset', preset);
  };

  const updateCustomMargin = (value: string) => {
    setCustomMargin(value);
    localStorage.setItem('edity-custom-margin', value);
  };

  const transcribeVideo = async (path: string, clipId?: string,
    progressCallback?: (phase: ProcessingPhase, progress: number, stage: string) => void) => {
    setTranscribing(true, 0);
    setTranscriptionStatus('Starting transcription');
    progressCallback?.('transcription', 0, 'Starting transcription');
    setTranscriptionError('');
    try {
      const res = await fetch(`${backendUrl}/transcribe/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: path, engine: transcriptionEngine, model: transcriptionModel, language: transcriptionLanguage }),
      });
      if (!res.ok || !res.body) throw new Error(`Transcription failed: ${res.statusText}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let pending = '';
      let completed = false;
      let rawResult: TranscriptionResult | null = null;
      const handleEvent = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line);
        if (event.type === 'status') {
          setTranscriptionStatus(event.message);
          progressCallback?.('transcription', useEditorStore.getState().transcriptionProgress, event.message);
        }
        if (event.type === 'progress') {
          setTranscribing(true, event.progress);
          const stage = event.message || (event.current && event.total
            ? `Transcribing chunk ${event.current} of ${event.total}` : 'Transcribing video');
          setTranscriptionStatus(stage);
          progressCallback?.('transcription', event.progress, stage);
        }
        if (event.type === 'error') throw new Error(event.detail);
        if (event.type === 'result') {
          rawResult = event.data as TranscriptionResult;
          completed = true;
        }
      };
      while (true) {
        const { value, done } = await reader.read();
        pending += decoder.decode(value, { stream: !done });
        const lines = pending.split('\n');
        pending = lines.pop() || '';
        lines.forEach(handleEvent);
        if (done) {
          handleEvent(pending);
          break;
        }
      }
      if (!completed || !rawResult) throw new Error('Transcription ended without a result');
      let result = rawResult as TranscriptionResult;
      setTranscriptionStatus('Codex is organizing paragraphs and checking ambiguous filler words…');
      setTranscribing(true, 0);
      progressCallback?.('cleanup', 0, 'Organizing transcript paragraphs with Codex');
      try {
        result = await cleanTranscript(backendUrl, result.words, result.language || transcriptionLanguage);
        setTranscribing(true, 100);
        progressCallback?.('cleanup', 100, 'Transcript cleanup complete');
      } catch (cleanupError) {
        console.warn('Transcript cleanup unavailable; keeping the verbatim transcription.', cleanupError);
        setTranscriptionStatus('Transcript ready; AI paragraph cleanup was unavailable.');
        progressCallback?.('cleanup', 100, 'Transcript cleanup unavailable; keeping literal transcript');
      }
      if (clipId) addClipTranscription(clipId, result);
      else setTranscription(result);
      setTranscriptionStatus('Scanning for coughs, burps and other non-speech sounds…');
      setTranscribing(true, 0);
      progressCallback?.('sounds', 0, 'Scanning non-speech sounds');
      try {
        let soundProgress = 0;
        const events = await scanSoundEvents(backendUrl, path, result.words, (progress) => {
          if (typeof progress.progress === 'number') {
            soundProgress = progress.progress;
            setTranscribing(true, soundProgress);
          }
          if (progress.message) setTranscriptionStatus(progress.message);
          progressCallback?.('sounds', soundProgress, progress.message || 'Scanning non-speech sounds');
        });
        const targetClipId = clipId || (useEditorStore.getState().clips.length === 1
          ? useEditorStore.getState().clips[0].id : undefined);
        replaceSoundEvents(events, targetClipId);
        const automaticallyMarked = events.filter((event) => event.markedForRemoval).length;
        setTranscriptionStatus(`${events.length} non-speech sound${events.length === 1 ? '' : 's'} found${automaticallyMarked
          ? `; ${automaticallyMarked} marked for removal` : ''}.`);
        progressCallback?.('sounds', 100, 'Non-speech sound scan complete');
      } catch (soundError) {
        console.warn('Sound event scan unavailable; transcription is still ready.', soundError);
        setTranscriptionStatus('Transcript ready; non-speech sound scan was unavailable.');
        progressCallback?.('sounds', 100, 'Non-speech sound scan unavailable');
      }
      return true;
    } catch (err) {
      console.error('Transcription error:', err);
      setTranscriptionError(String(err));
      return false;
    } finally {
      setTranscribing(false);
    }
  };

  const composeProjectClips = async (clips: ProjectClip[], outputPath: string) => {
    await fetch(`${backendUrl}/preview/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_path: outputPath }) }).catch(() => undefined);
    releaseVideo();
    await new Promise((resolve) => setTimeout(resolve, 150));
    const response = await fetch(`${backendUrl}/media/compose-timeline`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clip_paths: clips.map((clip) => clip.path), output_path: outputPath }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Could not build the project timeline');
    const timing = new Map<string, { start: number; duration: number }>(data.clips.map(
      (clip: { path: string; start: number; duration: number }) => [clip.path.toLowerCase(), clip]));
    const updated = clips.map((clip) => ({ ...clip,
      start: timing.get(clip.path.toLowerCase())?.start ?? clip.start,
      duration: timing.get(clip.path.toLowerCase())?.duration ?? clip.duration }));
    return { clips: updated, duration: Number(data.duration) };
  };

  const prepareImportedClip = async (path: string, onProgress: (message: string, progress: number) => void) => {
    if (/_(?:edity|cutscript)_silence(?:_\d+)?\.[^\\/.]+$/i.test(path)) {
      onProgress('Silence removal already completed', 100);
      return path;
    }
    const data = await removeSilence(backendUrl, { file_path: path, preset: silencePreset,
      custom_margin: silencePreset === 'custom' ? Number(customMargin) : undefined },
    (progress) => onProgress(progress.message, progress.phase_progress));
    return data.output_path;
  };

  const addProjectClips = async () => {
    const projectId = getActiveProjectId();
    if (!IS_ELECTRON || !projectId || !videoPath || clipBusy) return;
    const selected = await window.electronAPI!.openVideoFiles();
    if (!selected.length) return;
    setClipBusy(true);
    setClipStatus('Preparing clips…');
    setClipProgress(0);
    setTranscriptionError('');
    const added: ProjectClip[] = [];
    try {
      await saveCurrentProject();
      let project = await window.electronAPI!.openManagedProject(projectId);
      for (let index = 0; index < selected.length; index++) {
        const processed = await prepareImportedClip(selected[index], (message, progress) => {
          setClipStatus(`Clip ${index + 1} of ${selected.length} · ${message}`);
          setClipProgress(progress);
        });
        setClipStatus(`Clip ${index + 1} of ${selected.length} · Copying into project`);
        setClipProgress(0);
        const result = await window.electronAPI!.addProjectClip(projectId, processed,
          selected[index].split(/[\\/]/).pop(), (progress) => setClipProgress(progress.progress));
        project = result.project;
        added.push(result.clip);
      }
      setClipStatus('Building continuous project playback…');
      setClipProgress(null);
      const composed = await composeProjectClips(project.clips || [], videoPath);
      updateClips(composed.clips);
      refreshVideo(videoPath, composed.duration);
      let transcriptionFailures = 0;
      for (let index = 0; index < added.length; index++) {
        const clip = composed.clips.find((item) => item.id === added[index].id)!;
        setClipProgress(0);
        if (!await transcribeVideo(clip.path, clip.id, (_phase, progress, stage) => {
          setClipStatus(`Clip ${index + 1} of ${added.length} · ${stage}`);
          setClipProgress(progress);
        })) transcriptionFailures += 1;
      }
      await saveCurrentProject();
      setClipStatus(transcriptionFailures
        ? `${added.length} clips added; ${transcriptionFailures} could not be transcribed.`
        : `${added.length} clip${added.length === 1 ? '' : 's'} added.`);
      setClipProgress(100);
      await refreshProjects();
    } catch (error) {
      for (const clip of [...added].reverse()) {
        try { await window.electronAPI!.removeProjectClip(projectId, clip.id); } catch { /* Keep the original error. */ }
      }
      setProjectError(String(error));
      if (videoPath) refreshVideo(videoPath);
      setClipStatus('Could not add the clips.');
      setClipProgress(null);
    } finally {
      setClipBusy(false);
    }
  };

  const removeProjectClip = async (clipId: string) => {
    const projectId = getActiveProjectId();
    const state = useEditorStore.getState();
    const clip = state.clips.find((item) => item.id === clipId);
    if (!IS_ELECTRON || !projectId || !state.videoPath || !clip || state.clips.length <= 1 || clipBusy) return;
    const trashName = navigator.platform.toLowerCase().includes('mac') ? 'Trash' : 'Recycle Bin';
    if (!window.confirm(`Remove “${clip.name}” from this project? Its managed copy will be moved to the ${trashName}.`)) return;
    setClipBusy(true);
    setClipStatus('Rebuilding the project without this clip…');
    try {
      await saveCurrentProject();
      const remaining = state.clips.filter((item) => item.id !== clipId);
      const composed = await composeProjectClips(remaining, state.videoPath);
      await window.electronAPI!.removeProjectClip(projectId, clipId);
      removeClipData(clipId, composed.clips);
      refreshVideo(state.videoPath, composed.duration);
      await saveCurrentProject();
      setClipStatus('Clip removed.');
      await refreshProjects();
    } catch (error) {
      setProjectError(String(error));
      refreshVideo(state.videoPath);
      setClipStatus('Could not remove the clip.');
    } finally {
      setClipBusy(false);
    }
  };

  const renameActiveProject = async () => {
    const projectId = getActiveProjectId();
    const title = titleDraft.trim();
    setEditingTitle(false);
    if (!projectId || !title) return;
    try {
      await saveCurrentProject();
      await window.electronAPI!.renameManagedProject(projectId, title);
      await refreshProjects();
    } catch (error) {
      setProjectError(String(error));
    }
  };

  const togglePanel = (panel: Panel) =>
    setActivePanel((prev) => (prev === panel ? null : panel));

  if (!videoPath || showProjects) {
    return (
      <div className="h-screen flex flex-col items-center gap-7 bg-editor-bg px-6 py-8 overflow-y-auto">
        <div className="flex flex-col items-center gap-3">
          <Film className="w-14 h-14 text-editor-accent opacity-80" />
          <h1 className="text-3xl font-semibold tracking-tight">Edity</h1>
          <p className="text-editor-text-muted text-sm max-w-sm text-center">
            Open-source text-based video editing powered by AI.
          </p>
        </div>

        {IS_ELECTRON && <div className="w-full max-w-2xl space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Projects</h2>
              <p className="text-xs text-editor-text-muted">Open a project to continue editing where you left off.</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowLibrarySettings((visible) => !visible)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs rounded bg-editor-surface hover:bg-editor-border">
                <Settings className="w-3.5 h-3.5" />{showLibrarySettings ? 'Close Settings' : 'Settings'}
              </button>
              {videoPath && <button onClick={() => setShowProjects(false)}
                className="px-3 py-1.5 text-xs rounded bg-editor-surface hover:bg-editor-border">Back to editor</button>}
            </div>
          </div>
          {projects.length === 0 ? <p className="text-xs text-editor-text-muted py-3">No saved projects yet. Import a video below to create one.</p> :
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {projects.map((project) => <div key={project.id}
                className="rounded-lg bg-editor-surface border border-editor-border">
                <div className="flex items-center">
                  <button type="button" onClick={() => void openManagedProject(project.id)}
                    disabled={projectBusy || project.missingVideo}
                    className="flex-1 min-w-0 text-left p-3 hover:text-editor-accent disabled:opacity-50">
                    <span className="block text-sm font-medium truncate">{project.title}</span>
                    <span className="block text-[11px] text-editor-text-muted">
                      {project.missingVideo ? 'Video missing' : `Saved ${new Date(project.modifiedAt).toLocaleString('ca-ES')}`}
                    </span>
                  </button>
                  <button type="button" aria-label={`Actions for ${project.title}`}
                    aria-expanded={openActionsId === project.id}
                    onClick={() => { setOpenActionsId(openActionsId === project.id ? null : project.id); setRenamingId(null); }}
                    disabled={projectBusy}
                    className="p-2 mr-2 rounded hover:bg-editor-border disabled:opacity-50">
                    <MoreHorizontal className="w-5 h-5" />
                  </button>
                </div>
                {openActionsId === project.id && <div className="border-t border-editor-border p-2">
                  {renamingId === project.id ? <form className="flex gap-2" onSubmit={(event) => {
                    event.preventDefault(); void renameProject(project.id);
                  }}>
                    <input autoFocus value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)}
                      aria-label="New project name" maxLength={120}
                      className="min-w-0 flex-1 px-2 py-1 rounded bg-editor-bg border border-editor-border text-sm" />
                    <button type="submit" disabled={projectBusy || !renameDraft.trim()}
                      className="px-2 py-1 rounded bg-editor-accent text-xs disabled:opacity-50">Save</button>
                    <button type="button" onClick={() => setRenamingId(null)}
                      className="px-2 py-1 rounded bg-editor-border text-xs">Cancel</button>
                  </form> : <div className="grid grid-cols-2 gap-1 text-xs">
                    <button type="button" onClick={() => { setRenamingId(project.id); setRenameDraft(project.title); }}
                      disabled={projectBusy}
                      className="text-left px-2 py-1.5 rounded hover:bg-editor-border">Rename</button>
                    <button type="button" onClick={() => void duplicateProject(project.id)}
                      disabled={projectBusy}
                      className="text-left px-2 py-1.5 rounded hover:bg-editor-border">Duplicate</button>
                    <button type="button" onClick={() => void exportProjectFile(project)}
                      disabled={projectBusy}
                      className="text-left px-2 py-1.5 rounded hover:bg-editor-border">Export project</button>
                    <button type="button" onClick={() => void deleteProject(project)}
                      disabled={projectBusy}
                      className="text-left px-2 py-1.5 rounded text-editor-danger hover:bg-editor-danger/10">Delete project</button>
                  </div>}
                </div>}
              </div>)}
            </div>}
          <div className="flex items-center gap-2 text-[11px] text-editor-text-muted">
            <span className="truncate" title={projectsDirectory}>{projectsDirectory}</span>
            <button type="button" onClick={() => void window.electronAPI!.openProjectsDirectory()}
              className="shrink-0 underline hover:text-editor-text">Open folder</button>
          </div>
          {projectError && <p className="text-xs text-editor-danger break-words">{projectError}</p>}
          {projectActionMessage && <p className="text-xs text-editor-success break-words">{projectActionMessage}</p>}
        </div>}

        {showLibrarySettings && <div className="w-full max-w-2xl rounded-lg border border-editor-border bg-editor-surface/30">
          <SettingsPanel />
        </div>}

        <div className="space-y-2 text-center">
          <label className="text-xs text-editor-text-muted">Silence margin on import</label>
          <div className="flex items-center gap-2">
            <select value={silencePreset} onChange={(e) => updateSilencePreset(e.target.value as SilencePreset)}
              className="px-3 py-1.5 bg-editor-surface border border-editor-border rounded-lg text-xs">
              <option value="personal">Marca personal · 0,1 s</option>
              <option value="gaming">Jocs · 0,05 s</option>
              <option value="custom">Personalitzat</option>
            </select>
            {silencePreset === 'custom' && <input type="number" min="0" max="10" step="0.01"
              value={customMargin} onChange={(e) => updateCustomMargin(e.target.value)}
              aria-label="Silence margin in seconds"
              className="w-20 px-2 py-1.5 bg-editor-surface border border-editor-border rounded-lg text-xs" />}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap justify-center">
          <label className="text-xs text-editor-text-muted whitespace-nowrap">Transcription:</label>
          <select value={transcriptionEngine} onChange={(e) => {
            const engine = e.target.value as 'crisper' | 'whisperx';
            setTranscriptionEngine(engine);
            setTranscriptionModel(engine === 'crisper' ? 'medium' : 'large');
          }} className="px-3 py-1.5 bg-editor-surface border border-editor-border rounded-lg text-xs">
            <option value="crisper">CrisperWhisper literal</option>
            <option value="whisperx">WhisperX</option>
          </select>
          <select
            value={transcriptionModel}
            onChange={(e) => setTranscriptionModel(e.target.value)}
            className="px-3 py-1.5 bg-editor-surface border border-editor-border rounded-lg text-xs text-editor-text focus:outline-none focus:border-editor-accent"
          >
            {transcriptionEngine === 'crisper' ? <>
              <option value="small">Small</option><option value="medium">Medium</option>
              <option value="turbo">Turbo</option><option value="large">Large</option>
            </> : <>
              <option value="tiny">Tiny</option><option value="base">Base</option>
              <option value="small">Small</option><option value="medium">Medium</option>
              <option value="large">Large</option>
            </>}
          </select>
          <select value={transcriptionLanguage} onChange={(e) => setTranscriptionLanguage(e.target.value)}
            className="px-3 py-1.5 bg-editor-surface border border-editor-border rounded-lg text-xs">
            <option value="ca">Català</option><option value="es">Español</option><option value="en">English</option>
          </select>
        </div>
        {transcriptionEngine === 'crisper' && <p className="max-w-md text-center text-[11px] text-editor-text-muted">
          CrisperWhisper model weights are licensed for non-commercial research use. Check the license before using monetized videos.
        </p>}

        {IS_ELECTRON ? (
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={handleOpenFile}
              disabled={isImporting || projectBusy}
              className="flex items-center gap-2 px-6 py-3 bg-editor-accent hover:bg-editor-accent-hover rounded-lg text-white font-medium transition-colors"
            >
              {isImporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <FolderOpen className="w-5 h-5" />}
              {isImporting ? 'Importing video…' : 'Import Video File'}
            </button>
            <button
              onClick={handleLoadProject}
              disabled={projectBusy || isImporting}
              className="flex items-center gap-2 px-4 py-2 text-sm text-editor-text-muted hover:text-editor-text hover:bg-editor-surface rounded-lg transition-colors"
            >
              <FileInput className="w-4 h-4" />
              Import Project (.edity or legacy .aive)
            </button>
            {isImporting && importProgress && <div className="w-96 max-w-[85vw] rounded-lg border border-editor-border bg-editor-surface p-3 text-left space-y-2">
              <div className="flex items-center justify-between gap-3 text-xs font-medium">
                <span className="truncate">{importProgress.stage}</span>
                <span className="shrink-0">{importProgress.stageProgress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-editor-border">
                <div className="h-full bg-editor-accent transition-[width] duration-200"
                  style={{ width: `${importProgress.stageProgress}%` }} />
              </div>
              <div className="flex items-center justify-between text-[11px] text-editor-text-muted">
                <span>Complete import</span><span>{importProgress.overallProgress}%</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-editor-border">
                <div className="h-full bg-editor-success transition-[width] duration-200"
                  style={{ width: `${importProgress.overallProgress}%` }} />
              </div>
            </div>}
          </div>
        ) : (
          /* Browser: manual path input */
          <div className="w-full max-w-lg space-y-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-editor-warning/10 border border-editor-warning/30 rounded-lg">
              <span className="text-editor-warning text-xs">
                Running in browser — paste the full path to your video file below.
              </span>
            </div>
            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <div className="flex-1 relative">
                <FolderSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-editor-text-muted pointer-events-none" />
                <input
                  ref={fileInputRef}
                  type="text"
                  value={manualPath}
                  onChange={(e) => setManualPath(e.target.value)}
                  placeholder="C:\Videos\my-video.mp4"
                  className="w-full pl-9 pr-3 py-2.5 bg-editor-surface border border-editor-border rounded-lg text-sm text-editor-text placeholder:text-editor-text-muted/40 focus:outline-none focus:border-editor-accent"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={!manualPath.trim() || isImporting}
                className="flex items-center gap-2 px-5 py-2.5 bg-editor-accent hover:bg-editor-accent-hover disabled:opacity-40 rounded-lg text-sm text-white font-medium transition-colors whitespace-nowrap"
              >
                <Film className="w-4 h-4" />
                {isImporting ? 'Importing video…' : 'Load & Transcribe'}
              </button>
            </form>
            <p className="text-[11px] text-editor-text-muted text-center">
              Supported: MP4, AVI, MOV, MKV, WebM, M4A
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-editor-bg overflow-hidden">
      {/* Top bar */}
      <header className="h-12 flex items-center justify-between px-4 border-b border-editor-border shrink-0">
        <div className="flex items-center gap-3">
          {IS_ELECTRON && <button onClick={() => void showProjectLibrary()} title="Projects" aria-label="Projects"
            className="p-1 rounded text-editor-accent hover:bg-editor-surface"><FolderOpen className="w-5 h-5" /></button>}
          {editingTitle ? <input autoFocus value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => void renameActiveProject()}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingTitle(false); }}
            className="w-[300px] bg-editor-surface border border-editor-accent rounded px-2 py-1 text-sm" />
            : <button onClick={() => { const title = projects.find((project) => project.id === getActiveProjectId())?.title
              || videoPath.split(/[\\/]/).pop() || ''; setTitleDraft(title); setEditingTitle(true); }}
              title="Click to rename project" className="text-sm font-medium truncate max-w-[300px] hover:text-editor-accent">
              {projects.find((project) => project.id === getActiveProjectId())?.title || videoPath.split(/[\\/]/).pop()}
            </button>}
          {IS_ELECTRON && <span className={`text-[11px] ${saveStatus === 'error' ? 'text-editor-danger' : 'text-editor-text-muted'}`}>
            {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Save failed' : 'Saved'}
          </span>}
        </div>
        <div className="flex items-center gap-1">
          <ToolbarButton
            icon={<Sparkles className="w-4 h-4" />}
            label="AI"
            active={activePanel === 'ai'}
            onClick={() => togglePanel('ai')}
          />
          <ToolbarButton icon={<Film className="w-4 h-4" />} label="Media"
            active={activePanel === 'media'} onClick={() => togglePanel('media')} />
          <ToolbarButton icon={<AudioLines className="w-4 h-4" />} label="Studio Sound"
            active={activePanel === 'audio'} onClick={() => togglePanel('audio')} />
          <ToolbarButton
            icon={<Download className="w-4 h-4" />}
            label="Export"
            active={activePanel === 'export'}
            onClick={() => togglePanel('export')}
            disabled={words.length === 0}
          />
          <ToolbarButton
            icon={<Settings className="w-4 h-4" />}
            label="Settings"
            active={activePanel === 'settings'}
            onClick={() => togglePanel('settings')}
          />
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: video + transcript */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 flex min-h-0">
            {/* Video player */}
            <div className="w-1/2 p-3 flex items-center justify-center bg-black/20">
              <VideoPlayer />
            </div>

            {/* Transcript */}
            <div className="w-1/2 border-l border-editor-border flex flex-col min-h-0">
              {isTranscribing ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8">
                  <Loader2 className="w-8 h-8 text-editor-accent animate-spin" />
                  <div className="w-full max-w-md space-y-2">
                    <div className="flex items-center justify-between gap-3 text-sm text-editor-text-muted">
                      <span className="truncate">{transcriptionStatus || 'Processing video'}</span>
                      <span className="shrink-0 font-medium text-editor-text">{Math.round(transcriptionProgress)}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-editor-border">
                      <div className="h-full bg-editor-accent transition-[width] duration-200"
                        style={{ width: `${transcriptionProgress}%` }} />
                    </div>
                    {isImporting && importProgress && <>
                      <div className="flex items-center justify-between text-[11px] text-editor-text-muted">
                        <span>Complete import</span><span>{importProgress.overallProgress}%</span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-editor-border">
                        <div className="h-full bg-editor-success transition-[width] duration-200"
                          style={{ width: `${importProgress.overallProgress}%` }} />
                      </div>
                    </>}
                  </div>
                </div>
              ) : words.length > 0 ? (
                <TranscriptEditor />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-editor-text-muted text-sm px-6 text-center">
                  <p>{transcriptionError || 'No transcript yet'}</p>
                  <button onClick={() => void transcribeVideo(videoPath)}
                    className="px-3 py-1.5 rounded bg-editor-accent text-white hover:bg-editor-accent-hover">
                    {transcriptionError ? 'Retry transcription' : 'Transcribe video'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Waveform timeline */}
          <div className="h-32 border-t border-editor-border shrink-0">
            <WaveformTimeline />
          </div>
        </div>

        {/* Right panel (AI / Export / Settings) */}
        {activePanel && (
          <div className={`${activePanel === 'ai' ? 'w-[420px] max-w-[40vw] overflow-hidden' : 'w-80 overflow-y-auto'} border-l border-editor-border min-h-0 shrink-0`}>
            {activePanel === 'ai' && <AIPanel />}
            {activePanel === 'media' && <MediaPanel onAddClips={addProjectClips}
              onRemoveClip={removeProjectClip} clipBusy={clipBusy} clipStatus={clipStatus} clipProgress={clipProgress} />}
            {activePanel === 'audio' && <AudioPanel />}
            {activePanel === 'export' && <ExportDialog />}
            {activePanel === 'settings' && <SettingsPanel />}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolbarButton({
  icon,
  label,
  active,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
        active
          ? 'bg-editor-accent text-white'
          : 'text-editor-text-muted hover:text-editor-text hover:bg-editor-surface'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      {icon}
      {label}
    </button>
  );
}
