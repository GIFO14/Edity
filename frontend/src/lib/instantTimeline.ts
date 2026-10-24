import type { TimeRange } from '../types/project';

export function playableSourceTime(segments: TimeRange[], time: number): number {
  const containing=segments.find(segment=>segment.start<=time&&time<segment.end);if(containing)return time;
  const next=[...segments].sort((a,b)=>a.start-b.start).find(segment=>time<segment.start);if(next)return next.start;
  return segments.at(-1)?.end ?? time;
}

export function editedOffsetAt(segments: TimeRange[], sourceTime: number): number {
  const containing=segments.findIndex(segment=>segment.start<=sourceTime&&sourceTime<segment.end);
  if(containing>=0)return segments.slice(0,containing).reduce((n,s)=>n+s.end-s.start,0)+sourceTime-segments[containing].start;
  const next=[...segments].sort((a,b)=>a.start-b.start).find(segment=>sourceTime<segment.start);if(next)return editedOffsetAt(segments,next.start);
  let elapsed = 0;
  for (const segment of segments) {
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
