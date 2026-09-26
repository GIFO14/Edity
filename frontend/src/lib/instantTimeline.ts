import type { TimeRange } from '../types/project';

export function playableSourceTime(segments: TimeRange[], time: number): number {
  for (const segment of segments) {
    if (time < segment.start) return segment.start;
    if (time < segment.end) return time;
  }
  return segments.at(-1)?.end ?? time;
}

export function editedOffsetAt(segments: TimeRange[], sourceTime: number): number {
  let elapsed = 0;
  for (const segment of segments) {
    if (sourceTime <= segment.start) return elapsed;
    if (sourceTime < segment.end) return elapsed + sourceTime - segment.start;
    elapsed += segment.end - segment.start;
  }
  return elapsed;
}

export function sourceAtEditedOffset(segments: TimeRange[], offset: number): number {
  let elapsed = 0;
  for (const segment of segments) {
    const length = segment.end - segment.start;
    if (offset < elapsed + length) return segment.start + Math.max(0, offset - elapsed);
    elapsed += length;
  }
  return segments.at(-1)?.end ?? 0;
}
