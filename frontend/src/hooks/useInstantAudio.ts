import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useEditorStore } from '../store/editorStore';
import { editedOffsetAt, playableSourceTime, sourceAtEditedOffset } from '../lib/instantTimeline';
import { setInstantController } from '../lib/playbackTime';
import { getLockedCutBoundaries } from '../lib/cutRanges';
import type { TimeRange } from '../types/project';

type Anchor = { contextTime: number; editOffset: number; rate: number; segments: TimeRange[] };

export function useInstantAudio(videoRef: RefObject<HTMLVideoElement | null>) {
  const videoPath = useEditorStore((state) => state.videoPath);
  const backendUrl = useEditorStore((state) => state.backendUrl);
  const studioSoundEnabled = useEditorStore((state) => state.studioSoundEnabled);
  const words = useEditorStore((state) => state.words);
  const deletedRanges = useEditorStore((state) => state.deletedRanges);
  const soundEvents = useEditorStore((state) => state.soundEvents);
  const duration = useEditorStore((state) => state.duration);
  const getKeepSegments = useEditorStore((state) => state.getKeepSegments);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [refined, setRefined] = useState<{ key: string; segments: TimeRange[] } | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef<AudioBufferSourceNode[]>([]);
  const anchorRef = useRef<Anchor | null>(null);
  const pausedTimeRef = useRef(0);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const segmentsRef = useRef<TimeRange[]>([]);
  const selectedPathRef = useRef<string | null>(null);
  const attachedVideoRef = useRef<HTMLVideoElement | null>(null);
  const normalCacheRef = useRef<{ path: string; buffer: AudioBuffer } | null>(null);
  const studioCacheRef = useRef<{ path: string; buffer: AudioBuffer } | null>(null);

  const keepSegments = useMemo(() => getKeepSegments(),
    [getKeepSegments, words, deletedRanges, soundEvents, duration]);
  const locks = useMemo(() => getLockedCutBoundaries(words, deletedRanges, keepSegments),
    [words, deletedRanges, keepSegments]);
  const requestKey = JSON.stringify({ keepSegments, locks });
  const signature = JSON.stringify(refined?.key === requestKey ? refined.segments : keepSegments);

  useEffect(() => {
    if (!videoPath || keepSegments.length < 2) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`${backendUrl}/preview/refine`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ video_path: videoPath, keep_segments: keepSegments,
            locked_exit_indices: locks.lockedExitIndices,
            locked_entrance_indices: locks.lockedEntranceIndices,
            late_entrance_indices: locks.lateEntranceIndices }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Cut alignment returned ${response.status}`);
        const result = await response.json() as { keep_segments: TimeRange[] };
        if (!controller.signal.aborted) setRefined({ key: requestKey, segments: result.keep_segments });
      } catch (error) {
        if (!controller.signal.aborted) console.warn('Audio cut alignment unavailable:', error);
      }
    })();
    return () => controller.abort();
  }, [videoPath, backendUrl, requestKey]);

  useEffect(() => {
    if (!videoPath) return;
    const controller = new AbortController();
    selectedPathRef.current = videoPath;
    attachedVideoRef.current = null;
    setBuffer(normalCacheRef.current?.path === videoPath ? normalCacheRef.current.buffer : null);

    const load = async (studio: boolean): Promise<AudioBuffer | null> => {
      try {
        for (;;) {
          const response = await fetch(`${backendUrl}/preview/audio`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ video_path: videoPath, studio_sound: studio }),
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(`Audio preview returned ${response.status}`);
          const result = await response.json() as { status: string; path?: string; error?: string };
          if (result.status === 'ready' && result.path) {
            const file = await fetch(`${backendUrl}/file?path=${encodeURIComponent(result.path)}`,
              { signal: controller.signal });
            if (!file.ok) throw new Error(`Audio file returned ${file.status}`);
            const bytes = await file.arrayBuffer();
            if (controller.signal.aborted) return null;
            const context = contextRef.current ?? new AudioContext();
            contextRef.current = context;
            return await context.decodeAudioData(bytes);
          }
          if (result.status !== 'preparing') throw new Error(result.error || 'Audio preview unavailable');
          await new Promise<void>((resolve) => setTimeout(resolve, 1000));
          if (controller.signal.aborted) return null;
        }
      } catch (error) {
        if (!controller.signal.aborted) console.warn('Instant audio unavailable:', error);
        return null;
      }
    };

    void (async () => {
      const normal = normalCacheRef.current?.path === videoPath
        ? normalCacheRef.current.buffer : await load(false);
      if (!normal || controller.signal.aborted || selectedPathRef.current !== videoPath) return;
      normalCacheRef.current = { path: videoPath, buffer: normal };
      setBuffer(normal);
      if (studioSoundEnabled) {
        const enhanced = studioCacheRef.current?.path === videoPath
          ? studioCacheRef.current.buffer : await load(true);
        if (enhanced && !controller.signal.aborted && selectedPathRef.current === videoPath) {
          studioCacheRef.current = { path: videoPath, buffer: enhanced };
          setBuffer(enhanced);
        }
      }
    })();
    return () => { controller.abort(); };
  }, [videoPath, backendUrl, studioSoundEnabled]);

  useEffect(() => {
    const video = videoRef.current;
    const context = contextRef.current;
    if (!video || !buffer || !context) return;
    let active = true;
    bufferRef.current = buffer;
    const parsed = JSON.parse(signature) as TimeRange[];
    const segments = parsed.map((segment) => ({
      start: Math.max(0, segment.start), end: Math.min(buffer.duration, segment.end),
    })).filter((segment) => segment.end > segment.start);
    segmentsRef.current = segments;
    if (!segments.length) return;

    const stopNodes = () => {
      for (const node of nodesRef.current) {
        try { node.stop(); } catch { /* A source may have reached its natural end. */ }
        node.disconnect();
      }
      nodesRef.current = [];
      anchorRef.current = null;
    };

    const getTime = () => {
      const anchor = anchorRef.current;
      if (!anchor) return pausedTimeRef.current;
      const elapsed = Math.max(0, context.currentTime - anchor.contextTime) * anchor.rate;
      return sourceAtEditedOffset(anchor.segments, anchor.editOffset + elapsed);
    };

    const start = (time: number) => {
      stopNodes();
      const sourceTime = playableSourceTime(segments, time);
      pausedTimeRef.current = sourceTime;
      if (sourceTime >= segments[segments.length - 1].end) return;
      const rate = Math.max(0.25, video.playbackRate || 1);
      const when = context.currentTime + 0.02;
      let outputOffset = 0;
      for (const segment of segments) {
        const from = Math.max(segment.start, sourceTime);
        if (from >= segment.end) continue;
        const length = segment.end - from;
        const node = context.createBufferSource();
        node.buffer = buffer;
        node.playbackRate.value = rate;
        node.connect(context.destination);
        node.start(when + outputOffset, from, length);
        nodesRef.current.push(node);
        outputOffset += length / rate;
      }
      anchorRef.current = { contextTime: when, editOffset: editedOffsetAt(segments, sourceTime),
        rate, segments };
      if (Math.abs(video.currentTime - sourceTime) > 0.05) video.currentTime = sourceTime;
    };

    const seek = (time: number) => {
      const sourceTime = playableSourceTime(segments, time);
      pausedTimeRef.current = sourceTime;
      if (!video.paused) start(sourceTime);
      else stopNodes();
      video.currentTime = sourceTime;
      useEditorStore.getState().setCurrentTime(sourceTime);
    };

    const onPlay = () => {
      void context.resume().then(() => {
        if (active && !video.paused) start(pausedTimeRef.current || video.currentTime);
      }).catch(console.warn);
    };
    const onPause = () => {
      pausedTimeRef.current = getTime();
      stopNodes();
    };
    const onRateChange = () => {
      if (!video.paused && anchorRef.current) start(getTime());
    };
    const wasMuted = video.muted;
    video.muted = true;
    if (attachedVideoRef.current !== video) pausedTimeRef.current = video.currentTime;
    attachedVideoRef.current = video;
    setInstantController(video, { getTime, seek });
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ratechange', onRateChange);
    if (!video.paused) onPlay();

    let raf = 0;
    let lastSeek = 0;
    const tick = (now: number) => {
      if (!video.paused && anchorRef.current) {
        const time = getTime();
        const last = segments[segments.length - 1].end;
        if (time >= last - 0.005) {
          video.pause();
          pausedTimeRef.current = last;
        } else if (!video.seeking && now - lastSeek > 120 && Math.abs(video.currentTime - time) > 0.12) {
          video.currentTime = time;
          lastSeek = now;
        }
        useEditorStore.getState().setCurrentTime(time);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      active = false;
      cancelAnimationFrame(raf);
      pausedTimeRef.current = getTime();
      stopNodes();
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ratechange', onRateChange);
      setInstantController(video, null);
      video.muted = wasMuted;
    };
  }, [videoRef, buffer, signature]);

  useEffect(() => () => { void contextRef.current?.close(); contextRef.current = null; }, []);
}
