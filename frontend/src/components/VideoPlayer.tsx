import { useRef, useCallback, useState, useEffect } from 'react';
import { useEditorStore } from '../store/editorStore';
import { useVideoSync } from '../hooks/useVideoSync';
import { useInstantAudio } from '../hooks/useInstantAudio';
import { Play, Pause, SkipBack, SkipForward, Volume2 } from 'lucide-react';
import { playbackTimeFor, seekSourceTime, setPlaybackTimeline, sourceTimeAt } from '../lib/playbackTime';
import type { TimeRange } from '../types/project';

export default function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoUrl = useEditorStore((s) => s.videoUrl);
  const videoPath = useEditorStore((s) => s.videoPath);
  const backendUrl = useEditorStore((s) => s.backendUrl);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const duration = useEditorStore((s) => s.duration);
  const { seekTo, togglePlay } = useVideoSync(videoRef);
  useInstantAudio(videoRef);

  const [displayTime, setDisplayTime] = useState(0);
  const [playbackUrl, setPlaybackUrl] = useState(videoUrl);
  const [basePlaybackUrl, setBasePlaybackUrl] = useState(videoUrl);
  const [previewProgress, setPreviewProgress] = useState<number | null>(null);
  const [previewStatus, setPreviewStatus] = useState('Optimizing playback');
  const [playbackRate, setPlaybackRate] = useState(1);
  const resumeAfterSourceChange = useRef<{ time: number; playing: boolean; url: string;
    segments: TimeRange[] | null } | null>(null);

  const switchPlayback = useCallback((url: string, segments: TimeRange[] | null) => {
    const video = videoRef.current;
    resumeAfterSourceChange.current = video
      ? { time: sourceTimeAt(video), playing: !video.paused, url, segments }
      : { time: useEditorStore.getState().currentTime, playing: false, url, segments };
    if (video) video.dataset.editedPreview = segments ? '1' : '';
    setPlaybackUrl(url);
  }, []);

  useEffect(() => {
    setPlaybackUrl(videoUrl);
    setBasePlaybackUrl(videoUrl);
    resumeAfterSourceChange.current = null;
    setPreviewProgress(null);
    if (videoRef.current) {
      setPlaybackTimeline(videoRef.current, null);
      videoRef.current.dataset.editedPreview = '';
    }
  }, [videoPath, videoUrl]);

  useEffect(() => {
    if (!videoPath || !videoUrl) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const body = JSON.stringify({ video_path: videoPath, studio_sound: false });
    const check = async (endpoint: 'prepare' | 'status') => {
      try {
        const response = await fetch(`${backendUrl}/preview/${endpoint}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body, signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Preview service returned ${response.status}`);
        const result = await response.json() as { status: string; progress: number; stage?: string;
          path?: string; error?: string };
        if (controller.signal.aborted) return;
        if (result.status === 'ready' && result.path) {
          const url = `${backendUrl}/file?path=${encodeURIComponent(result.path)}`;
          setBasePlaybackUrl(url);
          switchPlayback(url, null);
          setPreviewProgress(null);
        } else if (result.status === 'preparing') {
          setPreviewProgress(result.progress);
          setPreviewStatus(result.stage || 'Optimizing playback');
          timer = setTimeout(() => { void check('status'); }, 1000);
        } else {
          setPreviewProgress(null);
          if (result.error) console.warn('Playback preview unavailable:', result.error);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setPreviewProgress(null);
          console.warn('Playback preview unavailable:', error);
        }
      }
    };
    void check('prepare');
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [videoPath, videoUrl, backendUrl, switchPlayback]);

  useEffect(() => {
    const target = basePlaybackUrl || videoUrl;
    if (target && playbackUrl !== target) {
      switchPlayback(target, null);
    }
  }, [playbackUrl, basePlaybackUrl, videoUrl, switchPlayback]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let raf = 0;
    let lastPaint = 0;
    const tick = (now: number) => {
      if (now - lastPaint >= 100) {
        setDisplayTime(sourceTimeAt(video));
        lastPaint = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      // StrictMode also runs effect cleanup while the element is still mounted.
      // Release the media source only after the video actually leaves the DOM.
      queueMicrotask(() => {
        if (!video.isConnected) {
          video.pause();
          video.removeAttribute('src');
          video.load();
        }
      });
    };
  }, [videoUrl]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      seekTo(ratio * duration);
    },
    [seekTo, duration],
  );

  const skip = useCallback(
    (delta: number) => {
      const video = videoRef.current;
      if (!video) return;
      seekTo(Math.max(0, Math.min(duration, sourceTimeAt(video) + delta)));
    },
    [seekTo, duration],
  );

  if (!videoUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center text-editor-text-muted text-sm">
        No video loaded
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 relative flex items-center justify-center bg-black rounded-lg overflow-hidden min-h-0">
        <video
          ref={videoRef}
          src={playbackUrl || undefined}
          className="max-w-full max-h-full object-contain"
          preload="auto"
          playsInline
          onClick={togglePlay}
          onLoadedMetadata={() => {
            const video = videoRef.current;
            if (!video) return;
            video.playbackRate = playbackRate;
            const resume = resumeAfterSourceChange.current;
            if (resume && video.getAttribute('src') !== resume.url) return;
            setPlaybackTimeline(video, resume?.segments ?? null);
            const resumeAt = resume?.time ?? useEditorStore.getState().currentTime;
            if (resumeAt > 0 && Number.isFinite(video.duration)) {
              video.currentTime = Math.min(playbackTimeFor(video, resumeAt),
                Math.max(0, video.duration - 0.1));
            } else if (resume) {
              resumeAfterSourceChange.current = null;
              if (resume.playing) void video.play().catch(console.warn);
            }
          }}
          onSeeked={() => {
            const resume = resumeAfterSourceChange.current;
            if (!resume) return;
            if (videoRef.current?.getAttribute('src') !== resume.url) return;
            resumeAfterSourceChange.current = null;
            if (resume.playing) void videoRef.current?.play().catch(console.warn);
          }}
        />
        {previewProgress !== null && <span className="absolute top-2 right-2 rounded bg-black/70 px-2 py-1 text-[10px] text-white pointer-events-none">
          {previewStatus}… {previewProgress}%
        </span>}
      </div>

      <div className="pt-2 space-y-1.5 shrink-0">
        <div
          className="h-1.5 bg-editor-border rounded-full cursor-pointer group"
          onClick={handleProgressClick}
        >
          <div
            className="h-full bg-editor-accent rounded-full relative transition-all group-hover:h-2"
            style={{ width: duration > 0 ? `${(displayTime / duration) * 100}%` : '0%' }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <ControlButton onClick={() => skip(-5)} title="Back 5s">
              <SkipBack className="w-4 h-4" />
            </ControlButton>
            <ControlButton onClick={togglePlay} title={isPlaying ? 'Pause' : 'Play'} primary>
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </ControlButton>
            <ControlButton onClick={() => skip(5)} title="Forward 5s">
              <SkipForward className="w-4 h-4" />
            </ControlButton>
          </div>

          <div className="flex items-center gap-3 text-xs text-editor-text-muted">
            <select value={playbackRate} onChange={(event) => {
              const rate = Number(event.target.value);
              setPlaybackRate(rate);
              if (videoRef.current) videoRef.current.playbackRate = rate;
            }} aria-label="Playback speed"
              className="bg-editor-surface border border-editor-border rounded px-1.5 py-1 text-xs text-editor-text">
              <option value={1}>1×</option>
              <option value={1.5}>1.5×</option>
              <option value={2}>2×</option>
            </select>
            <Volume2 className="w-3.5 h-3.5" />
            <span className="font-mono">
              {formatTime(displayTime)} / {formatTime(duration)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ControlButton({
  children,
  onClick,
  title,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-md transition-colors ${
        primary
          ? 'bg-editor-accent/20 text-editor-accent hover:bg-editor-accent/30'
          : 'text-editor-text-muted hover:text-editor-text hover:bg-editor-surface'
      }`}
    >
      {children}
    </button>
  );
}
