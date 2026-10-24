import { useRef, useCallback, useState, useEffect, useLayoutEffect } from 'react';
import './TimelineWorkspace.css';
import './PlaybackControls.css';
import { useEditorStore } from '../store/editorStore';
import { useVideoSync } from '../hooks/useVideoSync';
import { useInstantAudio } from '../hooks/useInstantAudio';
import { Play, Pause, SkipBack, SkipForward, Volume2, Maximize, Minimize } from 'lucide-react';
import { playbackTimeFor, seekSourceTime, setPlaybackTimeline, sourceTimeAt } from '../lib/playbackTime';
import type { TimeRange } from '../types/project';
import CompositionPlayer from './CompositionPlayer';
import CompositionTimeline from './CompositionTimeline';
import {useCompositionStore} from '../store/compositionStore';
import {sourceToEdit,editToSource} from '../composition/timeMap';
import {readPlaybackQuality,previewHeight,type PlaybackQuality} from '../lib/playbackQuality';

export default function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackSurface=useRef<HTMLDivElement>(null);
  const [fullscreen,setFullscreen]=useState(false),[fullscreenError,setFullscreenError]=useState('');
  const [quality,setQuality]=useState<PlaybackQuality>(readPlaybackQuality);
  useEffect(()=>{const changed=()=>{setFullscreen(document.fullscreenElement===playbackSurface.current);setFullscreenError('');};document.addEventListener('fullscreenchange',changed);return()=>document.removeEventListener('fullscreenchange',changed);},[]);
  const toggleFullscreen=async()=>{try{if(document.fullscreenElement===playbackSurface.current)await document.exitFullscreen();else await playbackSurface.current?.requestFullscreen();}catch{setFullscreenError('Could not enter full screen. Try again.');}};
  const layoutRef=useRef<HTMLDivElement>(null),resize=useRef<{y:number;height:number;pointer:number}|null>(null);
  const timelineSlot=useRef<HTMLDivElement>(null),timelineWide=useCompositionStore(s=>s.timelineWide);
  const [layout,setLayout]=useState({width:640,height:800});
  const [viewerRatio,setViewerRatio]=useState(()=>{const stored=Number(localStorage.getItem('edity-viewer-height-ratio')||1);return Number.isFinite(stored)?Math.max(.3,Math.min(1,stored)):1;});
  const maxViewer=Math.max(80,Math.min(layout.width*9/16,layout.height-230));
  const viewerHeight=Math.max(Math.min(120,maxViewer),Math.min(maxViewer,layout.width*9/16*viewerRatio));

  const videoUrl = useEditorStore((s) => s.videoUrl);
  const videoPath = useEditorStore((s) => s.videoPath);
  const backendUrl = useEditorStore((s) => s.backendUrl);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  useEffect(()=>{const node=layoutRef.current;if(!node)return;const observer=new ResizeObserver(()=>{const r=node.getBoundingClientRect();setLayout({width:r.width,height:r.height});});observer.observe(node);return()=>observer.disconnect();},[videoUrl]);
  // Preserve the mounted timeline and player while spanning the transcript column.
  useLayoutEffect(()=>{
    const slot=timelineSlot.current,split=layoutRef.current?.closest<HTMLElement>('.editor-main-split');if(!slot||!split)return;
    const measure=()=>split.style.setProperty('--timeline-wide-top',`${slot.getBoundingClientRect().top-split.getBoundingClientRect().top}px`);
    measure();const observer=new ResizeObserver(measure);observer.observe(slot);observer.observe(split);return()=>observer.disconnect();
  },[videoUrl,viewerHeight,timelineWide]);

  const sourceDuration = useEditorStore((s) => s.duration);
  const manifest=useCompositionStore(s=>s.manifest),duration=manifest?manifest.durationUs/1e6:sourceDuration;
  const editedTime=(source:number)=>manifest?(sourceToEdit(manifest,Math.round(source*1e6))??manifest.durationUs)/1e6:source;
  const seekEdited=(time:number)=>{const source=manifest?editToSource(manifest,Math.round(time*1e6))?.globalSourceUs:undefined;seekTo(source!==undefined?source/1e6:time);};
  const hasCuts = useEditorStore((s) => !!s.narration || s.deletedRanges.length > 0
    || s.soundEvents.some((event) => event.markedForRemoval));
  const { seekTo, togglePlay } = useVideoSync(videoRef);
  const { audioLoadError, waitingAtCut } = useInstantAudio(videoRef);

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
    if(video?.getAttribute('src')===url)return;
    resumeAfterSourceChange.current = video
      ? { time: sourceTimeAt(video), playing: !video.paused, url, segments }
      : { time: useEditorStore.getState().currentTime, playing: false, url, segments };
    // Freeze the shared audio clock before replacing the decoder source.
    // HTML media source replacement does not reliably dispatch a pause event.
    video?.pause();
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
    if(quality==='original'){setBasePlaybackUrl(videoUrl);switchPlayback(videoUrl,null);setPreviewProgress(null);return;}
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const body = JSON.stringify({ video_path: videoPath, studio_sound: false, max_height:previewHeight(quality) });
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
  }, [videoPath, videoUrl, backendUrl, switchPlayback,quality]);

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
        setDisplayTime(editedTime(sourceTimeAt(video)));
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
  }, [videoUrl,manifest]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      seekEdited(ratio * duration);
    },
    [seekTo, duration,manifest],
  );

  const skip = useCallback(
    (delta: number) => {
      const video = videoRef.current;
      if (!video) return;
      seekEdited(Math.max(0, Math.min(duration, editedTime(sourceTimeAt(video)) + delta)));
    },
    [seekTo, duration,manifest],
  );

  if (!videoUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center text-editor-text-muted text-sm">
        No video loaded
      </div>
    );
  }

  return (
    <div ref={layoutRef} data-player-layout className="w-full h-full min-h-0 flex flex-col">
      <div ref={playbackSurface} className="playback-surface" data-playback-surface data-playback-quality={quality}>
      <div data-video-stage className="shrink-0 self-center relative flex items-center justify-center bg-black rounded-lg overflow-hidden" style={{height:viewerHeight,width:viewerHeight*16/9,maxWidth:'100%'}}>
        <video
          ref={videoRef}
          src={playbackUrl || undefined}
          className="w-full h-full object-contain"
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
            if (!resume?.segments && Number.isFinite(video.duration)) useEditorStore.getState().setDuration(video.duration);
            const resumeAt = resume?.time ?? useEditorStore.getState().currentTime;
            if (resumeAt > 0 && Number.isFinite(video.duration)) {
              if(resume?.segments)video.currentTime=Math.min(playbackTimeFor(video,resumeAt),Math.max(0,video.duration-.1));
              else seekSourceTime(video,Math.min(resumeAt,Math.max(0,video.duration-.1)));
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
        <CompositionPlayer videoRef={videoRef} quality={quality} interactive={!fullscreen}/>
        {previewProgress !== null && <span className="absolute top-2 right-2 rounded bg-black/70 px-2 py-1 text-[10px] text-white pointer-events-none">
          {previewStatus}… {previewProgress}%
        </span>}
        {hasCuts && (waitingAtCut || audioLoadError) && <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded bg-black/80 px-3 py-2 text-xs text-white pointer-events-none">
          {audioLoadError ? 'Precise playback audio is unavailable' : 'Aligning this cut…'}
        </span>}
      </div>

      <div data-playback-controls className="pt-2 space-y-1.5 shrink-0">
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

        <div className="flex flex-wrap gap-1 items-center justify-between">
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

          <div className="flex items-center gap-2 text-xs text-editor-text-muted">
            <select aria-label="Playback quality" title="Playback quality (export quality is unchanged)" value={quality} onChange={event=>{const next=event.target.value as PlaybackQuality;setQuality(next);localStorage.setItem('edity-playback-quality',next);}}
              className="bg-editor-surface border border-editor-border rounded px-1.5 py-1 text-xs text-editor-text">
              <option value="auto">Auto (720p)</option><option value="360">360p</option><option value="480">480p</option><option value="720">720p</option><option value="1080">1080p</option><option value="original">Original</option>
            </select>
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
            <ControlButton onClick={()=>void toggleFullscreen()} title={fullscreen?'Exit full screen (Esc)':'Full screen'}>
              {fullscreen?<Minimize className="w-4 h-4"/>:<Maximize className="w-4 h-4"/>}
            </ControlButton>
          </div>
        </div>
      </div>
      {fullscreenError&&<p role="alert" className="text-xs text-orange-300">{fullscreenError}</p>}
      </div>
      <div role="separator" aria-label="Resize viewer and timeline" aria-orientation="horizontal" tabIndex={0} className="h-3 shrink-0 cursor-row-resize flex items-center justify-center group outline-none focus-visible:bg-editor-accent/30" style={{touchAction:'none'}}
        onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();resize.current={y:e.clientY,height:viewerHeight,pointer:e.pointerId};e.currentTarget.setPointerCapture(e.pointerId);}}
        onPointerMove={e=>{const r=resize.current;if(!r||r.pointer!==e.pointerId)return;const height=Math.max(Math.min(120,maxViewer),Math.min(maxViewer,r.height+e.clientY-r.y));setViewerRatio(height/(layout.width*9/16));}}
        onPointerUp={e=>{if(resize.current?.pointer!==e.pointerId)return;const r=resize.current;const height=Math.max(Math.min(120,maxViewer),Math.min(maxViewer,r.height+e.clientY-r.y)),ratio=height/(layout.width*9/16);setViewerRatio(ratio);resize.current=null;e.currentTarget.releasePointerCapture(e.pointerId);localStorage.setItem('edity-viewer-height-ratio',String(ratio));}}
        onPointerCancel={()=>{resize.current=null;}} onLostPointerCapture={()=>{resize.current=null;}} onDoubleClick={()=>{setViewerRatio(1);localStorage.removeItem('edity-viewer-height-ratio');}}
        onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();const next=Math.max(.3,Math.min(1,viewerRatio+(e.key==='ArrowUp'?-.05:.05)));setViewerRatio(next);localStorage.setItem('edity-viewer-height-ratio',String(next));}}}>
        <span className="h-1 w-14 rounded bg-editor-border group-hover:bg-editor-accent"/>
      </div>
      <div ref={timelineSlot} data-timeline-slot className="flex-1 min-h-0 min-w-0 flex flex-col">
        <CompositionTimeline videoRef={videoRef}/>
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
      aria-label={title}
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
