import { useEffect, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { useAIStore } from '../store/aiStore';
import type { MediaItem } from '../types/project';
import { copyProjectAsset } from '../lib/projectPersistence';
import { Plus, Trash2 } from 'lucide-react';

export default function MediaPanel({ onAddClips, onRemoveClip, clipBusy, clipStatus, clipProgress }: {
  onAddClips: () => Promise<void>;
  onRemoveClip: (clipId: string) => Promise<void>;
  clipBusy: boolean;
  clipStatus: string;
  clipProgress: number | null;
}) {
  const { mediaItems, addMediaItem, removeMediaItem, backendUrl, clips,
    mediaFolders, setMediaFolder } = useEditorStore();
  const [type, setType] = useState<MediaItem['type']>('image');
  const [source, setSource] = useState('');
  const [start, setStart] = useState('0');
  const [end, setEnd] = useState('5');
  const [volume, setVolume] = useState('0.3');
  const [sourceStart, setSourceStart] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const setDefaultMediaFolder = useAIStore((s) => s.setMediaFolder);
  const [catalog, setCatalog] = useState<Array<{ id: string; type: MediaItem['type']; path: string;
    name: string; duration: number; description: string }>>([]);
  const [analysis, setAnalysis] = useState<{ status: string; processed: number; total: number;
    failures?: string[]; error?: string }>({ status: 'idle', processed: 0, total: 0 });

  const refreshCatalog = async () => {
    const res = await fetch(`${backendUrl}/media/library/catalog`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folders: mediaFolders }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Could not load media library');
    setCatalog(data.assets || []);
  };

  useEffect(() => {
    if (!Object.values(mediaFolders || {}).some(Boolean)) { setCatalog([]); return; }
    void refreshCatalog().catch((reason) => setError(String(reason)));
  }, [backendUrl, mediaFolders]);

  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      try {
        const res = await fetch(`${backendUrl}/media/library/status`);
        if (!res.ok || stopped) return;
        const data = await res.json();
        setAnalysis(data);
        if (data.status === 'ready') void refreshCatalog().catch(console.warn);
      } catch { /* The backend may be starting up. */ }
    };
    void poll();
    const timer = setInterval(() => { if (analysis.status === 'analyzing') void poll(); }, 1200);
    return () => { stopped = true; clearInterval(timer); };
  }, [backendUrl, analysis.status, mediaFolders]);

  const analyzeLibrary = async () => {
    setError('');
    try {
      const res = await fetch(`${backendUrl}/media/library/analyze`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folders: mediaFolders }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not analyze library');
      setAnalysis(data);
    } catch (reason) { setError(String(reason)); }
  };

  const browse = async () => {
    const path = await window.electronAPI?.openFile();
    if (path) setSource(path);
  };

  const browseMediaFolder = async (folderType: 'image' | 'broll' | 'music') => {
    const path = await window.electronAPI?.openFile({ properties: ['openDirectory'] });
    if (!path) return;
    setMediaFolder(folderType, path);
    setDefaultMediaFolder(folderType, path);
  };

  const add = async () => {
    const startTime = Number(start);
    const endTime = Number(end);
    const gain = Number(volume);
    const offset = Number(sourceStart);
    if (!source.trim() || !Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime || startTime < 0 ||
      !Number.isFinite(offset) || offset < 0 || !Number.isFinite(gain) || gain < 0 || gain > 2) {
      setError('Enter a media file and valid start, end and volume.');
      return;
    }
    const known = catalog.find((asset) => asset.path === source.trim());
    if (type !== 'image' && known?.duration && offset >= known.duration) {
      setError('The source start must be before the end of the media file.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      let path = source.trim();
      if (path.startsWith('https://')) {
        const res = await fetch(`${backendUrl}/media/download`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: path, type }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Download failed');
        path = data.path;
      }
      path = await copyProjectAsset(path);
      addMediaItem({ id: crypto.randomUUID(), type, path, start: startTime, end: endTime,
        sourceStart: type === 'image' ? 0 : offset, volume: gain });
      setSource('');
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return <div className="p-4 space-y-4 text-xs">
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Project clips</h3>
        <button onClick={() => void onAddClips()} disabled={clipBusy}
          className="flex items-center gap-1 px-2 py-1 bg-editor-accent rounded disabled:opacity-40">
          <Plus className="w-3 h-3" /> Add clips
        </button>
      </div>
      <p className="text-editor-text-muted">Clips play continuously in this order. New clips are cleaned and transcribed when added.</p>
      {clips.map((clip, index) => <div key={clip.id} className="flex items-center gap-2 p-2 bg-editor-surface rounded">
        <span className="shrink-0 w-5 h-5 rounded-full bg-editor-accent/20 text-editor-accent flex items-center justify-center">{index + 1}</span>
        <span className="min-w-0 flex-1"><strong className="block truncate">{clip.name}</strong>
          <span className="text-editor-text-muted">{clip.duration > 0 ? `${clip.duration.toFixed(1)}s` : 'Duration pending'}</span></span>
        <button onClick={() => void onRemoveClip(clip.id)} disabled={clipBusy || clips.length <= 1}
          title={clips.length <= 1 ? 'A project must keep one clip' : 'Remove clip from project'}
          className="p-1 text-editor-danger disabled:opacity-30"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>)}
      {clipStatus && <div className="space-y-1 text-editor-accent">
        <div className="flex items-center justify-between gap-2"><span>{clipStatus}</span>
          {clipProgress !== null && <span className="shrink-0">{Math.round(clipProgress)}%</span>}</div>
        {clipProgress !== null && <div className="h-1.5 overflow-hidden rounded-full bg-editor-border">
          <div className="h-full bg-editor-accent transition-[width] duration-200"
            style={{ width: `${Math.max(0, Math.min(100, clipProgress))}%` }} />
        </div>}
      </div>}
    </div>

    <div className="border-t border-editor-border pt-4 space-y-3">
      <h3 className="text-sm font-semibold">Media folders</h3>
      <p className="text-editor-text-muted">These folders belong to this project. Changes also become the default for projects you create later.</p>
      {(['image', 'broll', 'music'] as const).map((folderType) => <div key={folderType} className="space-y-1">
        <label className="capitalize">{folderType === 'broll' ? 'B-roll' : folderType === 'image' ? 'Images' : 'Music'}</label>
        <div className="flex gap-1"><input value={mediaFolders[folderType]}
          onChange={(e) => { setMediaFolder(folderType, e.target.value); setDefaultMediaFolder(folderType, e.target.value); }}
          placeholder="Folder path" className="min-w-0 flex-1 p-2 bg-editor-surface border border-editor-border rounded" />
          <button onClick={() => void browseMediaFolder(folderType)}
            className="px-2 bg-editor-surface border border-editor-border rounded">Browse</button></div>
      </div>)}
    </div>

    <div className="border-t border-editor-border pt-4 space-y-4">
    <h3 className="text-sm font-semibold">Images, B-roll & music</h3>
    <p className="text-editor-text-muted">Times refer to the exported video, after cuts. B-roll audio is muted; music mixes under speech.</p>
    <div className="p-2 bg-editor-surface rounded space-y-2">
      <div className="flex items-center justify-between gap-2">
        <strong>Local media library</strong>
        <button onClick={() => void analyzeLibrary()} disabled={analysis.status === 'analyzing' || !Object.values(mediaFolders || {}).some(Boolean)}
          className="px-2 py-1 bg-editor-accent rounded disabled:opacity-40">Analyze folders</button>
      </div>
      <p className="text-editor-text-muted">Codex reviews sampled B-roll frames; you choose which suggestions to add. Media instructions are in the AI panel.</p>
      {analysis.status === 'analyzing' && <p>Analyzing {analysis.processed} / {analysis.total} files…</p>}
      {analysis.status === 'ready' && <p>{catalog.length} analyzed files ready.</p>}
      {analysis.error && <p className="text-editor-danger">{analysis.error}</p>}
      {!!analysis.failures?.length && <p className="text-editor-danger">{analysis.failures.length} files could not be analyzed: {analysis.failures.slice(0, 2).join('; ')}</p>}
      {catalog.slice(0, 50).map((asset) => <button key={asset.id} onClick={() => { setSource(asset.path); setType(asset.type); }}
        title={asset.description} className="block w-full text-left p-1.5 bg-editor-bg rounded hover:bg-editor-border">
        <strong>{asset.type} · {asset.name}</strong>{asset.duration > 0 ? ` · ${Math.round(asset.duration)}s` : ''}
        <span className="block text-editor-text-muted line-clamp-2">{asset.description}</span>
      </button>)}
      {catalog.length > 50 && <p className="text-editor-text-muted">Showing the first 50 of {catalog.length} files. All analyzed files are available to Codex.</p>}
    </div>
    <select value={type} onChange={(e) => setType(e.target.value as MediaItem['type'])}
      className="w-full p-2 bg-editor-surface border border-editor-border rounded">
      <option value="image">Image overlay</option><option value="broll">B-roll overlay</option>
      <option value="music">Music</option>
    </select>
    <div className="flex gap-1">
      <input value={source} onChange={(e) => setSource(e.target.value)}
        placeholder="Local path or direct HTTPS media URL" className="min-w-0 flex-1 p-2 bg-editor-surface border border-editor-border rounded" />
      {window.electronAPI && <button onClick={browse} className="px-2 bg-editor-surface border border-editor-border rounded">Browse</button>}
    </div>
    <div className="flex gap-2">
      <label className="flex-1">Start (s)<input type="number" min="0" step="0.1" value={start} onChange={(e) => setStart(e.target.value)}
        className="w-full p-2 bg-editor-surface border border-editor-border rounded" /></label>
      <label className="flex-1">End (s)<input type="number" min="0" step="0.1" value={end} onChange={(e) => setEnd(e.target.value)}
        className="w-full p-2 bg-editor-surface border border-editor-border rounded" /></label>
    </div>
    {type !== 'image' && <label>Start within {type === 'broll' ? 'B-roll clip' : 'music track'} (s)
      <input type="number" min="0" step="0.1" value={sourceStart} onChange={(e) => setSourceStart(e.target.value)}
        className="w-full p-2 bg-editor-surface border border-editor-border rounded" /></label>}
    {type === 'music' && <label>Volume (0–2)<input type="number" min="0" max="2" step="0.05" value={volume}
      onChange={(e) => setVolume(e.target.value)} className="w-full p-2 bg-editor-surface border border-editor-border rounded" /></label>}
    <button onClick={add} disabled={busy} className="w-full p-2 bg-editor-accent rounded disabled:opacity-50">
      {busy ? 'Downloading…' : 'Add media'}
    </button>
    {error && <p className="text-editor-danger">{error}</p>}
    <div className="space-y-2">
      {mediaItems.map((item) => <div key={item.id} className="p-2 bg-editor-surface rounded break-all">
        <div className="flex justify-between gap-2"><strong>{item.type} · {item.start}–{item.end}s{item.sourceStart ? ` · source +${item.sourceStart}s` : ''}</strong>
          <button onClick={() => removeMediaItem(item.id)} className="text-editor-danger">Remove</button></div>
        {item.path}
      </div>)}
    </div>
    </div>
  </div>;
}
