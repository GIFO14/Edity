import { useEffect, useState } from 'react';
import { AudioLines, CheckCircle2, Loader2, ScanSearch, Trash2, Undo2, Wind } from 'lucide-react';
import { useEditorStore } from '../store/editorStore';
import { scanSoundEvents } from '../lib/soundEvents';
import { seekSourceTime } from '../lib/playbackTime';

type AudioCapabilities = {
  deepfilternet_available: boolean;
  engine: string;
};

export default function AudioPanel() {
  const { backendUrl, videoPath, words, clips, studioSoundEnabled, setStudioSoundEnabled,
    soundEvents, replaceSoundEvents, markSoundEvents, setCurrentTime } = useEditorStore();
  const [capabilities, setCapabilities] = useState<AudioCapabilities | null>(null);
  const [error, setError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [scanStatus, setScanStatus] = useState('');
  const [scanProgress, setScanProgress] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setCapabilities(null);
    setError('');
    void fetch(`${backendUrl}/audio/capabilities`).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not check Studio Sound');
      if (!cancelled) setCapabilities(data);
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
    });
    return () => { cancelled = true; };
  }, [backendUrl]);

  const analyzeSounds = async () => {
    if (!videoPath || analyzing) return;
    setAnalyzing(true);
    setError('');
    setScanProgress(0);
    setScanStatus('Starting sound scan…');
    try {
      const events = await scanSoundEvents(backendUrl, videoPath, words, (progress) => {
        if (progress.message) setScanStatus(progress.message);
        if (typeof progress.progress === 'number') setScanProgress(progress.progress);
      });
      replaceSoundEvents(events, clips.length === 1 ? clips[0].id : undefined);
      setScanProgress(100);
      setScanStatus(`${events.length} non-speech sound${events.length === 1 ? '' : 's'} found.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setScanStatus('');
    } finally {
      setAnalyzing(false);
    }
  };

  const seek = (time: number) => {
    const video = document.querySelector('video');
    if (video) seekSourceTime(video, time);
    setCurrentTime(time);
  };

  const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString().padStart(2, '0')}.${Math.floor((seconds % 1) * 10)}`;

  return <div className="p-4 space-y-5 text-xs">
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <AudioLines className="w-5 h-5 text-editor-accent" />
        <h3 className="text-sm font-semibold">Studio Sound</h3>
      </div>
      <p className="text-editor-text-muted">
        Reduces steady background noise such as computer fans, room hiss and low ambient noise while preserving speech.
      </p>
    </div>

    <button type="button" role="switch" aria-checked={studioSoundEnabled}
      onClick={() => setStudioSoundEnabled(!studioSoundEnabled)}
      className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${studioSoundEnabled
        ? 'border-editor-accent bg-editor-accent/10' : 'border-editor-border bg-editor-surface hover:border-editor-text-muted'}`}>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${studioSoundEnabled
        ? 'bg-editor-accent' : 'bg-editor-border'}`}>
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${studioSoundEnabled
          ? 'translate-x-6' : 'translate-x-1'}`} />
      </span>
      <span className="min-w-0">
        <strong className="block">{studioSoundEnabled ? 'Enabled for this project' : 'Disabled'}</strong>
        <span className="text-editor-text-muted">Apply noise reduction to playback and every export</span>
      </span>
    </button>

    <div className="rounded-lg bg-editor-surface p-3 space-y-2">
      <div className="flex items-center gap-2 font-medium">
        {!capabilities && !error ? <Loader2 className="w-4 h-4 animate-spin" />
          : capabilities?.deepfilternet_available ? <CheckCircle2 className="w-4 h-4 text-editor-success" />
            : <Wind className="w-4 h-4 text-editor-text-muted" />}
        {!capabilities && !error ? 'Checking audio engine…' : error || capabilities?.engine}
      </div>
      {capabilities && <p className="text-editor-text-muted">
        {capabilities.deepfilternet_available
          ? 'DeepFilterNet is installed and will perform the full neural voice cleanup.'
          : 'DeepFilterNet is unavailable, so Edity will use its lighter FFmpeg noise filter.'}
      </p>}
    </div>

    <div className="border-t border-editor-border pt-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div><h3 className="text-sm font-semibold">Non-speech sounds</h3>
          <p className="text-editor-text-muted">Coughs, burps, sneezes, mouth noises and accidental sounds.</p></div>
        <button onClick={() => void analyzeSounds()} disabled={!videoPath || analyzing}
          className="shrink-0 flex items-center gap-1 rounded bg-editor-accent px-2 py-1.5 disabled:opacity-40">
          {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanSearch className="w-3.5 h-3.5" />}
          {soundEvents.length ? 'Rescan' : 'Scan'}
        </button>
      </div>
      {analyzing && <div className="space-y-1"><div className="h-1.5 overflow-hidden rounded bg-editor-border">
        <div className="h-full bg-editor-accent transition-all" style={{ width: `${scanProgress}%` }} /></div>
        <p className="text-editor-text-muted">{scanStatus}</p></div>}
      {!analyzing && scanStatus && <p className="text-editor-success">{scanStatus}</p>}
      {error && <p className="text-editor-danger">{error}</p>}
      <div className="space-y-2">
        {soundEvents.map((event) => <div key={event.id}
          className={`rounded border p-2 ${event.markedForRemoval
            ? 'border-editor-danger/50 bg-editor-danger/10' : 'border-editor-border bg-editor-surface'}`}>
          <div className="flex items-start gap-2">
            <button onClick={() => seek(event.start)} className="min-w-0 flex-1 text-left">
              <strong className={event.markedForRemoval ? 'line-through' : ''}>{event.label}</strong>
              <span className="block text-editor-text-muted">{formatTime(event.start)}–{formatTime(event.end)} · {Math.round(event.confidence * 100)}%</span>
              {event.overlapsSpeech && <span className="block text-amber-400">Overlaps speech; kept for review</span>}
            </button>
            <button onClick={() => markSoundEvents([event.id], !event.markedForRemoval)}
              title={event.markedForRemoval ? 'Keep this sound' : 'Mark this sound for removal'}
              className={event.markedForRemoval ? 'text-editor-success' : 'text-editor-danger'}>
              {event.markedForRemoval ? <Undo2 className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
            </button>
          </div>
        </div>)}
        {!soundEvents.length && !analyzing && <p className="text-editor-text-muted">No sound events have been detected yet.</p>}
      </div>
    </div>

    <div className="space-y-2 text-editor-text-muted">
      <p><strong className="text-editor-text">When it runs:</strong> on the project voice track before music or B-roll audio is mixed.</p>
      <p>Studio Sound is prepared as a separate playback preview, so you hear the processed result in the editor while the project source stays untouched. Marked sound events are skipped immediately and removed on export.</p>
      <p>Studio Sound takes longer than a normal export because it analyzes the complete voice track.</p>
    </div>
  </div>;
}
