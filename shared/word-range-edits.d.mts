type WordRange = { startIndex: number; endIndex: number };
type RemovalRange = { id: string; start: number; end: number; wordIndices: number[];
  cutStart?: number; cutEnd?: number };
export function isValidWordRange(range: WordRange, wordCount: number): boolean;
export function restoreMarkedWordRanges<T extends RemovalRange>(
  words: Array<{ start: number; end: number }>, deletedRanges: T[], ranges: WordRange[],
  createId: () => string,
): T[];
