export function isValidWordRange(range, wordCount) {
  return Number.isInteger(range?.startIndex) && Number.isInteger(range?.endIndex)
    && range.startIndex >= 0 && range.endIndex < wordCount
    && range.startIndex <= range.endIndex;
}

/** Remove only requested word marks, retaining unrelated cuts and outside boundaries. */
export function restoreMarkedWordRanges(words, deletedRanges, ranges, createId) {
  const restored = new Set();
  for (const range of ranges) {
    if (!isValidWordRange(range, words.length)) throw new Error('Invalid word range');
    for (let index = range.startIndex; index <= range.endIndex; index++) restored.add(index);
  }
  if (!deletedRanges.some(range => range.wordIndices.some(index => restored.has(index)))) {
    return deletedRanges;
  }
  return deletedRanges.flatMap(range => {
    if (!range.wordIndices.some(index => restored.has(index))) return [range];
    const original = [...range.wordIndices].sort((a, b) => a - b);
    const remaining = original.filter(index => !restored.has(index));
    const runs = [];
    for (const index of remaining) {
      const last = runs.at(-1);
      if (last && last.at(-1) + 1 === index) last.push(index);
      else runs.push([index]);
    }
    return runs.map((wordIndices, position) => {
      const first = wordIndices[0], last = wordIndices.at(-1);
      const updated = { ...range, id: position === 0 ? range.id : createId(),
        start: words[first].start, end: words[last].end, wordIndices };
      // An old override at a newly split edge could cut through a restored word.
      if (first !== original[0]) delete updated.cutStart;
      if (last !== original.at(-1)) delete updated.cutEnd;
      return updated;
    });
  });
}
