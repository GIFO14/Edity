import { useCallback, useRef, useEffect } from 'react';
import { useEditorStore } from '../store/editorStore';
import { getEffectiveCutRanges } from '../lib/cutRanges';
import { hasInstantController, hasPlaybackTimeline, seekSourceTime, sourceTimeAt } from '../lib/playbackTime';

export function useVideoSync(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const rafRef = useRef<number>(0);
  const {
    setCurrentTime,
    setDuration,
    setIsPlaying,
    deletedRanges,
    soundEvents,
    words,
    duration,
  } = useEditorStore();

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
      if (video.paused || hasPlaybackTimeline(video) || hasInstantController(video)) return;
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
      if (!hasPlaybackTimeline(video) && !video.dataset.editedPreview) setDuration(video.duration);
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
