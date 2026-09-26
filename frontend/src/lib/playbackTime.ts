import type { TimeRange } from '../types/project';

const timelines = new WeakMap<HTMLVideoElement, TimeRange[]>();
type InstantController = { getTime: () => number; seek: (time: number) => void };
const instantControllers = new WeakMap<HTMLVideoElement, InstantController>();

export function setInstantController(video: HTMLVideoElement, controller: InstantController | null): void {
  if (controller) instantControllers.set(video, controller);
  else instantControllers.delete(video);
}

export function hasInstantController(video: HTMLVideoElement): boolean {
  return instantControllers.has(video);
}

export function setPlaybackTimeline(video: HTMLVideoElement, segments: TimeRange[] | null): void {
  if (segments) timelines.set(video, segments);
  else timelines.delete(video);
}

export function hasPlaybackTimeline(video: HTMLVideoElement): boolean {
  return timelines.has(video);
}

export function sourceTimeAt(video: HTMLVideoElement): number {
  const instant = instantControllers.get(video);
  if (instant) return instant.getTime();
  const segments = timelines.get(video);
  if (!segments) return video.currentTime;
  let elapsed = 0;
  for (const segment of segments) {
    const length = segment.end - segment.start;
    if (video.currentTime < elapsed + length) return segment.start + Math.max(0, video.currentTime - elapsed);
    elapsed += length;
  }
  return segments.at(-1)?.end ?? 0;
}

export function playbackTimeFor(video: HTMLVideoElement, sourceTime: number): number {
  const segments = timelines.get(video);
  if (!segments) return sourceTime;
  let elapsed = 0;
  for (const segment of segments) {
    if (sourceTime < segment.start) return elapsed;
    if (sourceTime <= segment.end) return elapsed + sourceTime - segment.start;
    elapsed += segment.end - segment.start;
  }
  return elapsed;
}

export function seekSourceTime(video: HTMLVideoElement, sourceTime: number): void {
  const instant = instantControllers.get(video);
  if (instant) { instant.seek(sourceTime); return; }
  video.currentTime = playbackTimeFor(video, sourceTime);
}
