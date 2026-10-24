import { useCallback, useRef, useEffect } from 'react';
import { useEditorStore } from '../store/editorStore';
import {useCompositionStore} from '../store/compositionStore';
import { getEffectiveCutRanges } from '../lib/cutRanges';
import { hasInstantController, hasPlaybackTimeline, seekSourceTime, sourceTimeAt } from '../lib/playbackTime';

export function useVideoSync(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const rafRef = useRef<number>(0);
  const setCurrentTime=useEditorStore(s=>s.setCurrentTime),setDuration=useEditorStore(s=>s.setDuration),setIsPlaying=useEditorStore(s=>s.setIsPlaying);
  const deletedRanges=useEditorStore(s=>s.deletedRanges),soundEvents=useEditorStore(s=>s.soundEvents),words=useEditorStore(s=>s.words),duration=useEditorStore(s=>s.duration);

  const seekTo = useCallback(
    (time: number) => {
      if (videoRef.current) {
        seekSourceTime(videoRef.current, time);
        setCurrentTime(time);
      }
    },
    [videoRef, setCurrentTime],
  );

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
    } else {
      videoRef.current.pause();
    }
  }, [videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const cuts = getEffectiveCutRanges(words, deletedRanges, duration || video.duration || 0, soundEvents);

    const skipMarkedRange = () => {
      if (video.paused || video.dataset.precisePending || hasPlaybackTimeline(video)
          || hasInstantController(video)) return;
      let target = video.currentTime;
      const matching = cuts.find((range) => target >= range.start && target < range.end);
      if (matching) target = matching.end;
      if (target !== video.currentTime) video.currentTime = target;
    };

    let lastReported = 0;
    const tick = (now = performance.now()) => {
      skipMarkedRange();
      if (now - lastReported >= 80) {
        setCurrentTime(sourceTimeAt(video));
        lastReported = now;
      }
      if (!video.paused && !video.ended) rafRef.current = requestAnimationFrame(tick);
    };

    const onTimeUpdate = () => {
      skipMarkedRange();
      setCurrentTime(sourceTimeAt(video));
    };

    const onPlay = () => {
      setIsPlaying(true);
      cancelAnimationFrame(rafRef.current);
      tick();
    };
    const onPause = () => {
      setIsPlaying(false);
      cancelAnimationFrame(rafRef.current);
      setCurrentTime(sourceTimeAt(video));
    };
    const onLoadedMetadata = () => {
      // The edited proxy has a shorter timeline; project duration is always source time.
      if (!hasPlaybackTimeline(video) && !video.dataset.editedPreview) {
        const doc=useCompositionStore.getState().document,source=doc.assets[doc.elements.base?.assetId||''];
        setDuration(source?.durationUs>0?source.durationUs/1e6:video.duration);
      }
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    if (!video.paused && !video.ended) tick();

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      cancelAnimationFrame(rafRef.current);
    };
  }, [videoRef, deletedRanges, soundEvents, words, duration, setCurrentTime, setIsPlaying, setDuration]);

  return { seekTo, togglePlay };
}
