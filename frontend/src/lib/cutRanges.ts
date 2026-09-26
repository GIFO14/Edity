import type { DeletedRange, SoundEvent, TimeRange, Word } from '../types/project';

/** Build cuts from the two words that must survive each marked run. */
export function getEffectiveCutRanges(
  words: Word[], deletedRanges: DeletedRange[], videoEnd: number, soundEvents: SoundEvent[] = [],
): TimeRange[] {
  const end = Math.max(videoEnd, words[words.length - 1]?.end || 0,
    ...deletedRanges.map((range) => range.end));
  const byIndex = new Map<number, DeletedRange>();
  const cuts: TimeRange[] = [];
  for (const range of deletedRanges) {
    const indices = range.wordIndices.filter((index) => index >= 0 && index < words.length);
    if (!indices.length) cuts.push({ start: range.cutStart ?? range.start,
      end: range.cutEnd ?? range.end });
    for (const index of indices) if (!byIndex.has(index)) byIndex.set(index, range);
  }
  const sorted = [...byIndex.keys()].sort((a, b) => a - b);
  for (let position = 0; position < sorted.length;) {
    const first = sorted[position];
    let last = first;
    while (position + 1 < sorted.length && sorted[position + 1] === last + 1) {
      last = sorted[++position];
    }
    // Include pauses around removed words without padding into kept words.
    // Only the outside ends of adjoining marked ranges can set an override.
    const previousEnd = first > 0 ? words[first - 1].end : 0;
    const nextStart = last + 1 < words.length ? words[last + 1].start : end;
    cuts.push({ start: byIndex.get(first)?.cutStart ?? previousEnd,
      end: byIndex.get(last)?.cutEnd ?? nextStart });
    position++;
  }
  for (const event of soundEvents) {
    if (event.markedForRemoval) cuts.push({ start: Math.max(0, event.start),
      end: Math.min(end, event.end) });
  }
  cuts.sort((a, b) => a.start - b.start);

  const merged: TimeRange[] = [];
  for (const cut of cuts) {
    cut.start = Math.max(0, Math.min(cut.start, end));
    cut.end = Math.max(0, Math.min(cut.end, end));
    if (cut.end <= cut.start) continue;
    const last = merged[merged.length - 1];
    if (last && cut.start <= last.end) last.end = Math.max(last.end, cut.end);
    else merged.push({ ...cut });
  }
  return merged;
}

/** Boundaries corrected by the user stay unchanged in preview and export. */
export function getLockedCutBoundaries(
  words: Word[], deletedRanges: DeletedRange[], keepSegments: TimeRange[],
): { lockedExitIndices: number[]; lockedEntranceIndices: number[];
  lateEntranceIndices: number[] } {
  const exits = new Set<number>();
  const entrances = new Set<number>();
  const lateEntrances = new Set<number>();
  const deletedWords = new Set(deletedRanges.flatMap((range) => range.wordIndices));
  for (const range of deletedRanges) {
    if (!range.wordIndices.some((index) => index >= 0 && index < words.length)) continue;
    if (range.cutStart !== undefined) {
      const index = keepSegments.findIndex((segment) => Math.abs(segment.end - range.cutStart!) < 0.00001);
      if (index >= 0) exits.add(index);
    }
    if (range.cutEnd !== undefined) {
      const index = keepSegments.findIndex((segment) => Math.abs(segment.start - range.cutEnd!) < 0.00001);
      if (index >= 0) entrances.add(index);
    } else {
      const last = Math.max(...range.wordIndices);
      if (last >= 0 && last < words.length && !deletedWords.has(last + 1)
          && /[-—]$/.test(words[last].word)) {
        const nextStart = last + 1 < words.length ? words[last + 1].start : -1;
        const index = keepSegments.findIndex((segment) => Math.abs(segment.start - nextStart) < 0.00001);
        if (index >= 0) lateEntrances.add(index);
      }
    }
  }
  return { lockedExitIndices: [...exits], lockedEntranceIndices: [...entrances],
    lateEntranceIndices: [...lateEntrances] };
}
