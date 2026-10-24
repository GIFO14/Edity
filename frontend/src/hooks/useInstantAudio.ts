import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useEditorStore } from '../store/editorStore';
import { editedOffsetAt, playableSourceTime, sourceAtEditedOffset } from '../lib/instantTimeline';
import { setInstantController } from '../lib/playbackTime';
import { getLockedCutBoundaries } from '../lib/cutRanges';
import type { TimeRange } from '../types/project';
import { currentManifestRequest, requestCurrentManifest } from '../composition/manifestClient';
import { useCompositionStore } from '../store/compositionStore';

type Anchor = { contextTime: number; editOffset: number; rate: number; segments: TimeRange[] };

export function useInstantAudio(videoRef: RefObject<HTMLVideoElement | null>) {
  const videoPath = useEditorStore((state) => state.videoPath);
  const backendUrl = useEditorStore((state) => state.backendUrl);
  const studioSoundEnabled = useEditorStore((state) => state.studioSoundEnabled);
  const words = useEditorStore((state) => state.words);
  const language = useEditorStore((state) => state.language);
  const deletedRanges = useEditorStore((state) => state.deletedRanges);
  const soundEvents = useEditorStore((state) => state.soundEvents);
  const duration = useEditorStore((state) => state.duration);
  const clips=useEditorStore(state=>state.clips);
  const narration=useEditorStore(state=>state.narration);
  const processing=useEditorStore(state=>state.processing);
  const getKeepSegments = useEditorStore((state) => state.getKeepSegments);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [audioLoadError, setAudioLoadError] = useState(false);
  const [refinementErrorKey, setRefinementErrorKey] = useState<string | null>(null);
  const [refined, setRefined] = useState<{ key: string; segments: TimeRange[] } | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef<Array<{ source: AudioBufferSourceNode; gain: GainNode }>>([]);
  const anchorRef = useRef<Anchor | null>(null);
  const pausedTimeRef = useRef(0);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const segmentsRef = useRef<TimeRange[]>([]);
  const selectedPathRef = useRef<string | null>(null);
  const attachedVideoRef = useRef<HTMLVideoElement | null>(null);
  const normalCacheRef = useRef<{ path: string; buffer: AudioBuffer } | null>(null);
  const studioCacheRef = useRef<{ path: string; buffer: AudioBuffer } | null>(null);
  const resumeAtCutRef = useRef(false);
  const [waitingAtCut, setWaitingAtCut] = useState(false);
  const voiceGainDb=useCompositionStore(s=>s.document.buses.voice.gainDb+s.document.masterGainDb);
  const voiceMute=useCompositionStore(s=>s.document.buses.voice.mute);

  const keepSegments = useMemo(() => getKeepSegments(),
    [getKeepSegments, words, deletedRanges, soundEvents, duration]);
  const locks = useMemo(() => getLockedCutBoundaries(words, deletedRanges, keepSegments),
    [words, deletedRanges, keepSegments]);
  const deletedIndices = useMemo(() => [...new Set(deletedRanges.flatMap((range) => range.wordIndices))],
    [deletedRanges]);
  const requestKey = useMemo(()=>JSON.stringify(currentManifestRequest()),[videoPath,words,language,deletedRanges,soundEvents,duration,clips,narration,processing]);
  const signature = JSON.stringify(refined?.key === requestKey ? refined.segments : keepSegments);
  const hasCuts = !!narration||deletedRanges.length > 0 || soundEvents.some((event) => event.markedForRemoval);
  const boundariesReady = !hasCuts || refined?.key === requestKey
    || refinementErrorKey === requestKey;
  const audioReady = !!buffer && boundariesReady;
  useEffect(()=>{if(narration)videoRef.current?.pause();},[narration,videoRef]);
  const prefixCut = (keepSegments[0]?.start || 0) > 0;
  useEffect(()=>{const video=videoRef.current;if(!video||!(narration||prefixCut)||audioReady)return;const hold=()=>{resumeAtCutRef.current=!audioLoadError;video.pause();setWaitingAtCut(true);};video.addEventListener('play',hold);return()=>video.removeEventListener('play',hold);},[narration,prefixCut,audioReady,audioLoadError,videoRef]);

  useEffect(() => {
    if (!videoPath || duration<=0) return;
    const controller = new AbortController();
    setRefinementErrorKey(null);
    void (async () => {
      try {
        const manifest=await requestCurrentManifest();
        if (!controller.signal.aborted){setRefined({key:requestKey,segments:manifest.keepSegments});useCompositionStore.getState().setManifest(manifest);}
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn('Audio cut alignment unavailable:', error);
          setRefinementErrorKey(requestKey);
        }
      }
    })();
    return () => controller.abort();
  }, [videoPath, backendUrl, requestKey, duration]);

  useEffect(() => {
    if (!videoPath) return;
    const controller = new AbortController();
    selectedPathRef.current = videoPath;
    attachedVideoRef.current = null;
    setAudioLoadError(false);
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
        if (!controller.signal.aborted && !studio) setAudioLoadError(true);
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
    if (!video) return;
    if (!hasCuts || audioReady || audioLoadError) {
      delete video.dataset.precisePending;
      return;
    }
    // Native video can start at once. Hold only if playback reaches a cut
    // before its sample-accurate audio and boundaries have finished loading.
    video.dataset.precisePending = '1';
    let raf = 0;
    const guard = () => {
      if (!video.paused && !video.seeking) {
        const time = video.currentTime;
        for (let index = 0; index + 1 < keepSegments.length; index++) {
          const exit = keepSegments[index].end;
          const entrance = keepSegments[index + 1].start;
          if (time < exit - 0.12) break;
          if (time <= entrance + 0.25 && time >= exit - 0.12) {
            resumeAtCutRef.current = true;
            video.pause();
            video.currentTime = Math.max(keepSegments[index].start, exit - 0.12);
            setWaitingAtCut(true);
            break;
          }
        }
      }
      raf = requestAnimationFrame(guard);
    };
    raf = requestAnimationFrame(guard);
    return () => {
      cancelAnimationFrame(raf);
      delete video.dataset.precisePending;
    };
  }, [videoRef, hasCuts, audioReady, audioLoadError, keepSegments]);

  useEffect(() => {
    const video = videoRef.current;
    const context = contextRef.current;
    if (!video || !buffer || !context || !boundariesReady) return;
    let active = true;
    bufferRef.current = buffer;
    const parsed = JSON.parse(signature) as TimeRange[];
    const segments = parsed.map((segment) => ({
      start: Math.max(0, segment.start), end: Math.min(buffer.duration, segment.end),
    })).filter((segment) => segment.end > segment.start);
    segmentsRef.current = segments;
    if (!segments.length) return;

    const stopNodes = () => {
      for (const { source, gain } of nodesRef.current) {
        try { source.stop(); } catch { /* A source may have reached its natural end. */ }
        source.disconnect();
        gain.disconnect();
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
      const firstIndex=segments.findIndex(s=>s.start<=sourceTime&&sourceTime<s.end);if(firstIndex<0)return;
      const rate = Math.max(0.25, video.playbackRate || 1);
      const voiceGain=voiceMute?0:10**(voiceGainDb/20);
      const when = context.currentTime + 0.02;
      let outputOffset = 0;
      let audibleIndex = 0;
      for (let index = firstIndex; index < segments.length; index++) {
        const segment = segments[index];
        const from = index===firstIndex?sourceTime:segment.start;
        if (from >= segment.end) continue;
        const length = segment.end - from;
        const node = context.createBufferSource();
        const gain = context.createGain();
        node.buffer = buffer;
        node.playbackRate.value = rate;
        node.connect(gain).connect(context.destination);
        const startAt = when + outputOffset;
        const fade = Math.min(0.008, length / 3) / rate;
        gain.gain.setValueAtTime(voiceGain, startAt);
        if (audibleIndex > 0) {
          gain.gain.setValueAtTime(0, startAt);
          gain.gain.linearRampToValueAtTime(voiceGain, startAt + fade);
        }
        if (index < segments.length - 1) {
          gain.gain.setValueAtTime(voiceGain, startAt + length / rate - fade);
          gain.gain.linearRampToValueAtTime(0, startAt + length / rate);
        }
        node.start(startAt, from, length);
        nodesRef.current.push({ source: node, gain });
        outputOffset += length / rate;
        audibleIndex++;
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
    const wasLoop=video.loop;if(narration)video.loop=true;
    video.muted = true;
    if (attachedVideoRef.current !== video) pausedTimeRef.current = video.currentTime;
    attachedVideoRef.current = video;
    setInstantController(video, { getTime, seek });
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ratechange', onRateChange);
    if (!video.paused) onPlay();

    let lastSeek = 0;
    let lastReport=0;
    const tick = (now: number) => {
      if (!video.paused && anchorRef.current) {
        const time = getTime();
        const last = segments[segments.length - 1].end,total=segments.reduce((n,s)=>n+s.end-s.start,0),anchor=anchorRef.current;
        if (anchor.editOffset+Math.max(0,context.currentTime-anchor.contextTime)*anchor.rate>=total-.005) {
          video.pause();
          pausedTimeRef.current = last;
        } else if (!video.seeking && now - lastSeek > 120 && Math.abs(video.currentTime - time) > 0.12) {
          video.currentTime = time;
          lastSeek = now;
        }
        if(now-lastReport>=80){useEditorStore.getState().setCurrentTime(time);lastReport=now;}
      }
    };
    // Transport must keep following the audio clock even when a heavy visual
    // delays painting or Chromium throttles an occluded canvas.
    const transportTimer=setInterval(()=>tick(performance.now()),30);
    return () => {
      active = false;
      clearInterval(transportTimer);
      pausedTimeRef.current = getTime();
      stopNodes();
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ratechange', onRateChange);
      setInstantController(video, null);
      video.muted = wasMuted;
      video.loop=wasLoop;
    };
  }, [videoRef, buffer, signature, boundariesReady,voiceGainDb,voiceMute]);

  useEffect(() => {
    if ((!audioReady && !audioLoadError) || !resumeAtCutRef.current) return;
    const video = videoRef.current;
    resumeAtCutRef.current = false;
    setWaitingAtCut(false);
    if (video) void video.play().catch(console.warn);
  }, [videoRef, audioReady, audioLoadError]);

  useEffect(() => () => { void contextRef.current?.close(); contextRef.current = null; }, []);
  return { audioReady, audioLoadError: audioLoadError || refinementErrorKey === requestKey,
    waitingAtCut };
}
