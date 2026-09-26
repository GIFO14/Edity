import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { useAIStore } from '../store/aiStore';
import { Sparkles, Scissors, Film, Loader2, Check, X, Play, Download } from 'lucide-react';
import type { ChatMessage, ClipSuggestion } from '../types/project';
import { copyProjectAsset, getActiveProjectId } from '../lib/projectPersistence';
import { getEffectiveCutRanges } from '../lib/cutRanges';
import { cleanTranscript } from '../lib/transcriptCleanup';
import { seekSourceTime } from '../lib/playbackTime';

type EditPlan = {
  reply: string;
  deleteRanges: Array<{ startIndex: number; endIndex: number; reason: string }>;
  soundEventActions: Array<{ id: string; action: 'remove' | 'keep'; reason: string }>;
  mediaIdeas: Array<{ type: string; query: string; url?: string; localPath?: string;
    assetId?: string; startTime: number; endTime: number; sourceStart?: number; reason: string }>;
  markForRemoval: boolean;
};

export default function AIPanel() {
  const { words, videoPath, backendUrl, deletedRanges, soundEvents, duration, chatMessages, deleteWordRange,
    markWordRanges, addChatMessage, markChatPlanApplied,
    markSoundEvents, addMediaItem, setCurrentTime, mediaFolders, language, applyTranscriptCleanup } = useEditorStore();
  const {
    editingInstructions,
    mediaInstructions,
    customFillerWords,
    fillerResult,
    clipSuggestions,
    isProcessing,
    processingMessage,
    setCustomFillerWords,
    setFillerResult,
    setClipSuggestions,
    setProcessing,
    setEditingInstructions,
    setMediaInstructions,
  } = useAIStore();

  const [activeTab, setActiveTab] = useState<'chat' | 'filler' | 'clips'>('chat');
  const [chatInput, setChatInput] = useState('');
  const [chatError, setChatError] = useState('');
  const [cleaningTranscript, setCleaningTranscript] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ block: 'end' }); }, [chatMessages.length, isProcessing]);

  const improveTranscript = useCallback(async () => {
    if (!words.length || cleaningTranscript) return;
    const projectId = getActiveProjectId();
    const requestVideoPath = videoPath;
    setCleaningTranscript(true);
    setCleanupMessage('Codex is rebuilding the paragraphs and checking ambiguous filler words…');
    try {
      const result = await cleanTranscript(backendUrl, words, language);
      if (getActiveProjectId() !== projectId || useEditorStore.getState().videoPath !== requestVideoPath) return;
      if (!applyTranscriptCleanup(result)) throw new Error('The cleaned transcript no longer matched the timed words.');
      setFillerResult(null);
      const corrected = result.corrections.length;
      setCleanupMessage(`Transcript improved: ${result.segments.length} readable paragraphs${corrected
        ? ` and ${corrected} safe text correction${corrected === 1 ? '' : 's'}` : ''}.`);
    } catch (error) {
      setCleanupMessage(error instanceof Error ? error.message : 'Codex could not improve the transcript.');
    } finally {
      setCleaningTranscript(false);
    }
  }, [words, cleaningTranscript, videoPath, backendUrl, language, applyTranscriptCleanup, setFillerResult]);

  const askCodex = useCallback(async () => {
    if (isProcessing || !chatInput.trim() || !words.length) return;
    const message = chatInput.trim();
    const projectId = getActiveProjectId();
    const requestVideoPath = videoPath;
    setChatInput('');
    setChatError('');
    setProcessing(true, 'Codex is reviewing the edit…');
    const history = chatMessages.filter((entry) => entry.role !== 'error')
      .map((entry) => ({ role: entry.role, text: entry.text }));
    addChatMessage({ id: crypto.randomUUID(), role: 'user', text: message, createdAt: new Date().toISOString() });
    try {
      let mediaAssets: Array<{ id: string; type: string; path: string; name: string;
        duration: number; description: string }> = [];
      const hasMediaFolders = Object.values(mediaFolders || {}).some(Boolean);
      const wantsMedia = /media|b[ -]?roll|music|música|imatg|image|footage|visual|intro|dinàmic|dynamic|clip|vídeo|video|gràfic/i.test(message);
      if (hasMediaFolders && wantsMedia) {
        setProcessing(true, 'Analyzing your media library…');
        const response = await fetch(`${backendUrl}/media/library/analyze`, { method: 'POST',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folders: mediaFolders }) });
        const started = await response.json();
        if (!response.ok) throw new Error(started.detail || 'Could not analyze media library');
        while (true) {
          const statusResponse = await fetch(`${backendUrl}/media/library/status`);
          const status = await statusResponse.json();
          if (!statusResponse.ok || status.status === 'error') throw new Error(status.error || 'Media analysis failed');
          if (status.status !== 'analyzing') break;
          setProcessing(true, `Analyzing media ${status.processed} / ${status.total}…`);
          await new Promise((resolve) => setTimeout(resolve, 1200));
          if (getActiveProjectId() !== projectId || useEditorStore.getState().videoPath !== requestVideoPath) return;
        }
      }
      if (hasMediaFolders) {
        const response = await fetch(`${backendUrl}/media/library/catalog`, { method: 'POST',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folders: mediaFolders }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Could not read media library');
        mediaAssets = data.assets || [];
      }
      setProcessing(true, 'Codex is reviewing the edit…');
      const deleted = deletedRanges.flatMap((range) => range.wordIndices);
      const cuts = getEffectiveCutRanges(words, deletedRanges, duration || words.at(-1)?.end || 0, soundEvents);
      const exportedTime = (time: number) => time - cuts.reduce((total, cut) =>
        total + Math.max(0, Math.min(time, cut.end) - cut.start), 0);
      const res = await fetch(`${backendUrl}/ai/edit-chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, instructions: editingInstructions, media_instructions: mediaInstructions,
          media_assets: mediaAssets, history, deleted_indices: deleted,
          sound_events: soundEvents,
          words: words.map((w, index) => ({ index, word: w.word, start: w.start, end: w.end,
            exported_start: exportedTime(w.start), exported_end: exportedTime(w.end) })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Codex could not answer.');
      if (getActiveProjectId() !== projectId || useEditorStore.getState().videoPath !== requestVideoPath) return;
      const plan = data as EditPlan;
      plan.soundEventActions ||= [];
      const marked = plan.markForRemoval && (plan.deleteRanges.length > 0 || plan.soundEventActions.length > 0);
      if (marked) {
        markWordRanges(plan.deleteRanges);
        markSoundEvents(plan.soundEventActions.filter((action) => action.action === 'remove').map((action) => action.id), true);
        markSoundEvents(plan.soundEventActions.filter((action) => action.action === 'keep').map((action) => action.id), false);
      }
      addChatMessage({ id: crypto.randomUUID(), role: 'assistant', text: plan.reply,
        createdAt: new Date().toISOString(), plan: {
          deleteRanges: plan.deleteRanges, soundEventActions: plan.soundEventActions, mediaIdeas: plan.mediaIdeas, marked,
        } });
    } catch (error) {
      if (getActiveProjectId() !== projectId || useEditorStore.getState().videoPath !== requestVideoPath) return;
      const explanation = error instanceof Error ? error.message : 'Codex could not answer.';
      addChatMessage({ id: crypto.randomUUID(), role: 'error', text: explanation, createdAt: new Date().toISOString() });
    } finally {
      setProcessing(false);
    }
  }, [chatInput, words, deletedRanges, soundEvents, duration, backendUrl, editingInstructions, mediaInstructions,
    mediaFolders, chatMessages, videoPath, isProcessing,
    markWordRanges, markSoundEvents, addChatMessage, setProcessing]);

  const applyEditPlan = (message: ChatMessage) => {
    if (!message.plan) return;
    markWordRanges(message.plan.deleteRanges);
    const actions = message.plan.soundEventActions || [];
    markSoundEvents(actions.filter((action) => action.action === 'remove').map((action) => action.id), true);
    markSoundEvents(actions.filter((action) => action.action === 'keep').map((action) => action.id), false);
    markChatPlanApplied(message.id);
  };

  const addSuggestedMedia = async (idea: EditPlan['mediaIdeas'][number]) => {
    if (!(idea.localPath || idea.url?.startsWith('https://')) || !['image', 'broll', 'music'].includes(idea.type)) return;
    const projectId = getActiveProjectId();
    const requestVideoPath = videoPath;
    setChatError('');
    try {
      let mediaPath = idea.localPath || '';
      if (!mediaPath) {
        const res = await fetch(`${backendUrl}/media/download`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: idea.url, type: idea.type }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Download failed');
        mediaPath = data.path;
      }
      if (getActiveProjectId() !== projectId || useEditorStore.getState().videoPath !== requestVideoPath) return;
      const path = await copyProjectAsset(mediaPath);
      if (getActiveProjectId() !== projectId || useEditorStore.getState().videoPath !== requestVideoPath) return;
      addMediaItem({ id: crypto.randomUUID(), type: idea.type as 'image' | 'broll' | 'music',
        path, start: idea.startTime, end: idea.endTime, sourceStart: idea.sourceStart || 0, volume: 0.3 });
    } catch (error) {
      if (getActiveProjectId() !== projectId || useEditorStore.getState().videoPath !== requestVideoPath) return;
      setChatError(String(error));
    }
  };

  const detectFillers = useCallback(async () => {
    if (words.length === 0) return;
    setProcessing(true, 'Detecting filler words...');
    try {
      const transcript = words.map((w) => w.word).join(' ');
      const res = await fetch(`${backendUrl}/ai/filler-removal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          words: words.map((w, i) => ({ index: i, word: w.word })),
          provider: 'codex',
          custom_filler_words: customFillerWords || undefined,
        }),
      });
      if (!res.ok) throw new Error('Filler detection failed');
      const data = await res.json();
      setFillerResult(data);
    } catch (err) {
      console.error(err);
    } finally {
      setProcessing(false);
    }
  }, [words, backendUrl, customFillerWords, setProcessing, setFillerResult]);

  const createClips = useCallback(async () => {
    if (words.length === 0) return;
    setProcessing(true, 'Finding best clip segments...');
    try {
      const transcript = words.map((w) => w.word).join(' ');
      const res = await fetch(`${backendUrl}/ai/create-clip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          words: words.map((w, i) => ({
            index: i,
            word: w.word,
            start: w.start,
            end: w.end,
          })),
          provider: 'codex',
          target_duration: 60,
        }),
      });
      if (!res.ok) throw new Error('Clip creation failed');
      const data = await res.json();
      setClipSuggestions(data.clips || []);
    } catch (err) {
      console.error(err);
    } finally {
      setProcessing(false);
    }
  }, [words, backendUrl, setProcessing, setClipSuggestions]);

  const applyFillerDeletions = useCallback(() => {
    if (!fillerResult) return;
    const sorted = [...fillerResult.fillerWords].sort((a, b) => b.index - a.index);
    for (const fw of sorted) {
      deleteWordRange(fw.index, fw.index);
    }
    setFillerResult(null);
  }, [fillerResult, deleteWordRange, setFillerResult]);

  const handlePreviewClip = useCallback(
    (clip: ClipSuggestion) => {
      setCurrentTime(clip.startTime);
      const video = document.querySelector('video');
      if (video) {
        seekSourceTime(video, clip.startTime);
        video.play();
      }
    },
    [setCurrentTime],
  );

  const [exportingClipIndex, setExportingClipIndex] = useState<number | null>(null);

  const handleExportClip = useCallback(
    async (clip: ClipSuggestion, index: number) => {
      if (!videoPath) return;
      setExportingClipIndex(index);
      try {
        const safeName = clip.title.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
        const dirSep = videoPath.lastIndexOf('\\') >= 0 ? '\\' : '/';
        const dir = videoPath.substring(0, videoPath.lastIndexOf(dirSep));
        const outputPath = `${dir}${dirSep}${safeName}_clip.mp4`;

        const res = await fetch(`${backendUrl}/export`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input_path: videoPath,
            output_path: outputPath,
            keep_segments: [{ start: clip.startTime, end: clip.endTime }],
            mode: 'fast',
            format: 'mp4',
          }),
        });
        if (!res.ok) throw new Error('Export failed');
        const data = await res.json();
        alert(`Clip exported to: ${data.output_path}`);
      } catch (err) {
        console.error(err);
        alert('Failed to export clip. Check console for details.');
      } finally {
        setExportingClipIndex(null);
      }
    },
    [videoPath, backendUrl],
  );

  return (
    <div className="flex flex-col h-full">
      <details className="border-b border-editor-border shrink-0 group">
        <summary className="p-3 cursor-pointer text-xs font-medium text-editor-text-muted hover:text-editor-text">
          AI instructions
        </summary>
        <div className="px-3 pb-3 space-y-3 text-xs">
          <label className="block space-y-1"><span>Transcript editing and video treatment</span>
            <textarea value={editingInstructions} onChange={(e) => setEditingInstructions(e.target.value)} rows={4}
              placeholder="Keep the best take, remove retakes, use subtle zooms…"
              className="w-full p-2 bg-editor-surface border border-editor-border rounded resize-y" /></label>
          <label className="block space-y-1"><span>Images, B-roll and music</span>
            <textarea value={mediaInstructions} onChange={(e) => setMediaInstructions(e.target.value)} rows={4}
              placeholder="Use more B-roll in the introduction; stop once the main explanation begins…"
              className="w-full p-2 bg-editor-surface border border-editor-border rounded resize-y" /></label>
          <div className="space-y-1.5 border-t border-editor-border pt-3">
            <button onClick={() => void improveTranscript()} disabled={cleaningTranscript || words.length === 0}
              className="w-full flex items-center justify-center gap-2 p-2 bg-editor-accent rounded disabled:opacity-50">
              {cleaningTranscript ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {cleaningTranscript ? 'Improving transcript…' : 'Improve current transcript'}
            </button>
            <p className="text-[11px] text-editor-text-muted">
              Rebuilds readable paragraphs and checks whether ambiguous [UH] tokens are really the Catalan connector “a”. Word timing and removal marks stay unchanged.
            </p>
            {cleanupMessage && <p className="text-[11px] text-editor-text-muted" role="status">{cleanupMessage}</p>}
          </div>
          <p className="text-[11px] text-editor-text-muted">These defaults apply across projects. A specific chat request overrides them for that response.</p>
        </div>
      </details>
      <div className="flex border-b border-editor-border shrink-0">
        <TabButton active={activeTab === 'chat'} onClick={() => setActiveTab('chat')}
          icon={<Sparkles className="w-3.5 h-3.5" />} label="Codex Chat" />
        <TabButton
          active={activeTab === 'filler'}
          onClick={() => setActiveTab('filler')}
          icon={<Scissors className="w-3.5 h-3.5" />}
          label="Filler Words"
        />
        <TabButton
          active={activeTab === 'clips'}
          onClick={() => setActiveTab('clips')}
          icon={<Film className="w-3.5 h-3.5" />}
          label="Create Clips"
        />
      </div>

      <div className={`flex-1 min-h-0 ${activeTab === 'chat' ? 'overflow-hidden' : 'overflow-y-auto p-4'}`}>
        {activeTab === 'chat' && <div className="flex flex-col h-full min-h-0 text-xs">
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3" aria-label="Codex conversation">
            {chatMessages.length === 0 && <p className="text-editor-text-muted">
              Ask Codex a question or tell it what to mark. Marks are reversible; the source video stays intact until export.
            </p>}
            {chatMessages.map((entry) => <div key={entry.id}
              className={`rounded-lg p-3 whitespace-pre-wrap break-words ${entry.role === 'user'
                ? 'ml-5 bg-editor-accent/20' : entry.role === 'error' ? 'bg-editor-danger/10 text-editor-danger' : 'mr-5 bg-editor-surface'}`}>
              <strong className="block mb-1">{entry.role === 'user' ? 'You' : entry.role === 'error' ? 'Error' : 'Codex'}</strong>
              {entry.text}
              {entry.plan && <div className="mt-3 space-y-2 border-t border-editor-border pt-2">
                {entry.plan.deleteRanges.length > 0 && <>
                  <p className="font-medium">{entry.plan.marked ? 'Marked for removal' : 'Suggested marks'}</p>
                  {entry.plan.deleteRanges.map((range, index) => <p key={index} className="text-editor-text-muted">
                    {range.startIndex}–{range.endIndex}: {range.reason}
                  </p>)}
                  {!entry.plan.marked && <button onClick={() => applyEditPlan(entry)}
                    className="px-2 py-1 bg-editor-success/20 text-editor-success rounded">
                    Apply edit suggestions
                  </button>}
                </>}
                {(entry.plan.soundEventActions || []).length > 0 && <>
                  <p className="font-medium">Detected sound decisions</p>
                  {(entry.plan.soundEventActions || []).map((action) => {
                    const event = soundEvents.find((item) => item.id === action.id);
                    return <p key={action.id} className="text-editor-text-muted">
                      {action.action === 'remove' ? 'Remove' : 'Keep'} {event?.label || action.id}: {action.reason}
                    </p>;
                  })}
                  {!entry.plan.marked && entry.plan.deleteRanges.length === 0 && <button onClick={() => applyEditPlan(entry)}
                    className="px-2 py-1 bg-editor-success/20 text-editor-success rounded">
                    Apply these sound decisions
                  </button>}
                </>}
                {entry.plan.mediaIdeas.length > 0 && <>
                  <p className="font-medium">Media ideas</p>
                  {entry.plan.mediaIdeas.map((idea, index) => <p key={index} className="p-2 bg-black/20 rounded">
                    {idea.type} · {idea.startTime}–{idea.endTime}s · {idea.query}
                    {idea.sourceStart ? ` · source +${idea.sourceStart}s` : ''}<br />{idea.reason}
                    {(idea.localPath || idea.url?.startsWith('https://')) && <button onClick={() => addSuggestedMedia(idea)}
                      className="block mt-2 px-2 py-1 bg-editor-accent rounded">Add to media</button>}
                  </p>)}
                </>}
              </div>}
            </div>)}
            {isProcessing && <div className="flex items-center gap-2 text-editor-text-muted"><Loader2 className="w-3 h-3 animate-spin" />{processingMessage}</div>}
            <div ref={messagesEndRef} />
          </div>
          <div className="p-3 border-t border-editor-border shrink-0 space-y-2">
            <textarea value={chatInput} onChange={(e) => setChatInput(e.target.value)} rows={3}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void askCodex(); } }}
              placeholder="Ask Codex to find retakes, errors or media ideas…"
              className="w-full p-2 bg-editor-surface border border-editor-border rounded resize-none" />
            <button onClick={() => void askCodex()} disabled={isProcessing || !chatInput.trim()}
              className="w-full p-2 bg-editor-accent rounded disabled:opacity-50">
              Send
            </button>
            {chatError && <p className="text-editor-danger">{chatError}</p>}
          </div>
        </div>}
        {activeTab === 'filler' && (
          <div className="space-y-4">
            <p className="text-xs text-editor-text-muted">
              Use AI to detect and remove filler words like "um", "uh", "like", "you know" from
              your transcript.
            </p>
            <div className="space-y-1.5">
              <label className="text-[11px] text-editor-text-muted font-medium">
                Custom filler words (comma-separated)
              </label>
              <input
                type="text"
                value={customFillerWords}
                onChange={(e) => setCustomFillerWords(e.target.value)}
                placeholder="e.g. okay, alright, anyway"
                className="w-full px-2.5 py-1.5 text-xs bg-editor-surface border border-editor-border rounded focus:border-editor-accent focus:outline-none"
              />
            </div>
            <button
              onClick={detectFillers}
              disabled={isProcessing || words.length === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-editor-accent hover:bg-editor-accent-hover disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {processingMessage}
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Detect Filler Words
                </>
              )}
            </button>

            {fillerResult && fillerResult.fillerWords.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">
                    Found {fillerResult.fillerWords.length} filler words
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={applyFillerDeletions}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-editor-success/20 text-editor-success rounded hover:bg-editor-success/30"
                    >
                      <Check className="w-3 h-3" /> Apply All
                    </button>
                    <button
                      onClick={() => setFillerResult(null)}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-editor-border text-editor-text-muted rounded hover:bg-editor-surface"
                    >
                      <X className="w-3 h-3" /> Dismiss
                    </button>
                  </div>
                </div>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {fillerResult.fillerWords.map((fw) => (
                    <div
                      key={fw.index}
                      className="flex items-center justify-between px-2 py-1.5 bg-editor-word-filler rounded text-xs"
                    >
                      <span>
                        <strong>"{fw.word}"</strong>
                        <span className="text-editor-text-muted ml-1">— {fw.reason}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {fillerResult && fillerResult.fillerWords.length === 0 && (
              <p className="text-xs text-editor-success">No filler words detected.</p>
            )}
          </div>
        )}

        {activeTab === 'clips' && (
          <div className="space-y-4">
            <p className="text-xs text-editor-text-muted">
              AI analyzes your transcript and suggests the most engaging segments for a
              YouTube Short or social media clip.
            </p>
            <button
              onClick={createClips}
              disabled={isProcessing || words.length === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-editor-accent hover:bg-editor-accent-hover disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {processingMessage}
                </>
              ) : (
                <>
                  <Film className="w-4 h-4" />
                  Find Best Clips
                </>
              )}
            </button>

            {clipSuggestions.length > 0 && (
              <div className="space-y-3">
                {clipSuggestions.map((clip, i) => (
                  <div key={i} className="p-3 bg-editor-surface rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">{clip.title}</span>
                      <span className="text-[10px] text-editor-text-muted">
                        {Math.round(clip.endTime - clip.startTime)}s
                      </span>
                    </div>
                    <p className="text-[11px] text-editor-text-muted">{clip.reason}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handlePreviewClip(clip)}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-editor-accent/20 text-editor-accent rounded hover:bg-editor-accent/30 transition-colors"
                      >
                        <Play className="w-3 h-3" /> Preview
                      </button>
                      <button
                        onClick={() => handleExportClip(clip, i)}
                        disabled={exportingClipIndex === i}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-editor-success/20 text-editor-success rounded hover:bg-editor-success/30 disabled:opacity-50 transition-colors"
                      >
                        {exportingClipIndex === i ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Download className="w-3 h-3" />
                        )}
                        Export
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors border-b-2 ${
        active
          ? 'border-editor-accent text-editor-accent'
          : 'border-transparent text-editor-text-muted hover:text-editor-text'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
