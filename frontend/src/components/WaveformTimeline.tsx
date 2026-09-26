import { useRef, useEffect, useCallback, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { getEffectiveCutRanges } from '../lib/cutRanges';
import { seekSourceTime, sourceTimeAt } from '../lib/playbackTime';
import { ZoomIn, ZoomOut, AlertTriangle } from 'lucide-react';

type WaveformData = { duration: number; peaks: number[] };

export default function WaveformTimeline() {
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const headCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  const videoUrl = useEditorStore((s) => s.videoUrl);
  const videoPath = useEditorStore((s) => s.videoPath);
  const duration = useEditorStore((s) => s.duration);
  const deletedRanges = useEditorStore((s) => s.deletedRanges);
  const soundEvents = useEditorStore((s) => s.soundEvents);
  const words = useEditorStore((s) => s.words);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);

  const waveformRef = useRef<WaveformData | null>(null);
  const zoomRef = useRef(1);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!videoUrl || !videoPath) return;
    setAudioError(null);
    const controller = new AbortController();

    const loadAudio = async () => {
      try {
        const response = await fetch(`${useEditorStore.getState().backendUrl}/audio/waveform?path=${encodeURIComponent(videoPath)}`,
          { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const waveform = await response.json() as WaveformData;
        if (controller.signal.aborted) return;
        waveformRef.current = waveform;
        drawStaticWaveform();
      } catch (err) {
        if (controller.signal.aborted) return;
        console.warn('Could not decode audio for waveform:', err);
        setAudioError('Waveform unavailable — audio could not be decoded');
      }
    };

    loadAudio();

    return () => {
      controller.abort();
      waveformRef.current = null;
    };
  }, [videoUrl, videoPath]);

  const drawStaticWaveform = useCallback(() => {
    const canvas = waveCanvasRef.current;
    const waveform = waveformRef.current;
    if (!canvas || !waveform) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const { peaks } = waveform;

    ctx.clearRect(0, 0, width, height);

    for (const range of getEffectiveCutRanges(words, deletedRanges, waveform.duration, soundEvents)) {
      const x1 = (range.start / waveform.duration) * width;
      const x2 = (range.end / waveform.duration) * width;
      ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
      ctx.fillRect(x1, 0, x2 - x1, height);
    }

    for (const event of soundEvents) {
      const x1 = (event.start / waveform.duration) * width;
      const x2 = (event.end / waveform.duration) * width;
      ctx.fillStyle = event.markedForRemoval ? 'rgba(239, 68, 68, 0.75)' : 'rgba(245, 158, 11, 0.85)';
      ctx.fillRect(x1, 0, Math.max(2, x2 - x1), 4);
    }

    const mid = height / 2;
    ctx.beginPath();
    ctx.strokeStyle = '#4a4d5e';
    ctx.lineWidth = 1;

    for (let x = 0; x < width; x++) {
      const start = Math.floor((x / width) * peaks.length);
      const end = Math.max(start + 1, Math.ceil(((x + 1) / width) * peaks.length));
      let peak = 0;
      for (let i = start; i < Math.min(end, peaks.length); i++) peak = Math.max(peak, peaks[i]);
      const yMin = mid - peak * mid * 0.9;
      const yMax = mid + peak * mid * 0.9;
      ctx.moveTo(x, yMin);
      ctx.lineTo(x, yMax);
    }
    ctx.stroke();
  }, [deletedRanges, soundEvents, words]);

  // Redraw static layer when deletedRanges change
  useEffect(() => {
    drawStaticWaveform();
  }, [drawStaticWaveform]);

  // Lightweight RAF loop for playhead only -- reads video.currentTime directly,
  // never triggers React re-renders
  useEffect(() => {
    const headCanvas = headCanvasRef.current;
    const waveCanvas = waveCanvasRef.current;
    if (!headCanvas || !waveCanvas) return;

    const tick = () => {
      const ctx = headCanvas.getContext('2d');
      if (!ctx) { rafRef.current = requestAnimationFrame(tick); return; }

      const waveform = waveformRef.current;
      const video = document.querySelector('video') as HTMLVideoElement | null;
      const dur = waveform?.duration ?? 0;

      const dpr = window.devicePixelRatio || 1;
      const rect = headCanvas.getBoundingClientRect();
      if (headCanvas.width !== waveCanvas.width || headCanvas.height !== waveCanvas.height) {
        headCanvas.width = rect.width * dpr;
        headCanvas.height = rect.height * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const width = rect.width;
      const height = rect.height;
      ctx.clearRect(0, 0, width, height);

      if (dur > 0 && video) {
        const px = (sourceTimeAt(video) / dur) * width;
        ctx.beginPath();
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 2;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, height);
        ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [videoUrl]);

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      drawStaticWaveform();
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [drawStaticWaveform]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!headCanvasRef.current || duration === 0) return;
      const rect = headCanvasRef.current.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      const newTime = ratio * duration;
      setCurrentTime(newTime);
      const video = document.querySelector('video');
      if (video) seekSourceTime(video, newTime);
    },
    [duration, setCurrentTime],
  );

  if (!videoUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center text-editor-text-muted text-xs">
        Load a video to see the waveform
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-1 shrink-0">
        <span className="text-[10px] text-editor-text-muted font-medium uppercase tracking-wider">
          Timeline
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { zoomRef.current = Math.max(0.5, zoomRef.current - 0.5); drawStaticWaveform(); }}
            className="p-0.5 text-editor-text-muted hover:text-editor-text"
            title="Zoom out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => { zoomRef.current = Math.min(10, zoomRef.current + 0.5); drawStaticWaveform(); }}
            className="p-0.5 text-editor-text-muted hover:text-editor-text"
            title="Zoom in"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {audioError ? (
        <div className="flex-1 flex items-center justify-center gap-2 text-editor-text-muted text-xs">
          <AlertTriangle className="w-4 h-4 text-yellow-500" />
          <span>{audioError}</span>
        </div>
      ) : (
        <div className="flex-1 relative">
          <canvas ref={waveCanvasRef} className="absolute inset-0 w-full h-full" />
          <canvas
            ref={headCanvasRef}
            className="absolute inset-0 w-full h-full cursor-crosshair"
            onClick={handleClick}
          />
        </div>
      )}
    </div>
  );
}
