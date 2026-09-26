import test from 'node:test';
import assert from 'node:assert/strict';
import { getEffectiveCutRanges, getLockedCutBoundaries } from './cutRanges.ts';
import type { Word, DeletedRange } from '../types/project';

test('cuts include surrounding pauses but never overlap nominal kept words', () => {
  const words: Word[] = [
    { word: 'homework', start: 12.3, end: 12.5, confidence: 1 },
    { word: '[UH]', start: 13.58, end: 13.75, confidence: 1 },
    { word: 'that', start: 13.75, end: 14.12, confidence: 1 },
    { word: 'do', start: 15.12, end: 15.32, confidence: 1 },
    { word: 'that', start: 15.54, end: 15.62, confidence: 1 },
  ];
  const marks: DeletedRange[] = [{ id: 'retake', start: 13.58, end: 15.32, wordIndices: [1, 2, 3] }];
  assert.deepEqual(getEffectiveCutRanges(words, marks, 20), [{ start: 12.5, end: 15.54 }]);
});

test('a touching short word is kept whole in the nominal cut', () => {
  const words: Word[] = [
    { word: 'So', start: 342.34, end: 342.42, confidence: 1 },
    { word: 'as', start: 342.42, end: 342.58, confidence: 1 },
    { word: 'te-', start: 342.76, end: 342.92, confidence: 1 },
    { word: 'smoke', start: 343.26, end: 343.36, confidence: 1 },
  ];
  const marks: DeletedRange[] = [{ id: 'retake', start: 342.42, end: 342.92,
    wordIndices: [1, 2] }];
  assert.deepEqual(getEffectiveCutRanges(words, marks, 344),
    [{ start: 342.42, end: 343.26 }]);
  assert.deepEqual(getLockedCutBoundaries(words, marks,
    [{ start: 0, end: 342.42 }, { start: 343.26, end: 344 }]),
  { lockedExitIndices: [], lockedEntranceIndices: [], lateEntranceIndices: [1] });
  marks[0].cutStart = 342.5;
  marks[0].cutEnd = 343.4;
  assert.deepEqual(getEffectiveCutRanges(words, marks, 344),
    [{ start: 342.5, end: 343.4 }]);
  assert.deepEqual(getLockedCutBoundaries(words, marks,
    [{ start: 0, end: 342.5 }, { start: 343.4, end: 344 }]),
  { lockedExitIndices: [0], lockedEntranceIndices: [1], lateEntranceIndices: [] });
});

test('adjacent marked runs join and a manual correction is locked', () => {
  const words: Word[] = [
    { word: 'keep', start: 0, end: 0.4, confidence: 1 },
    { word: 'cut', start: 1, end: 1.2, confidence: 1 },
    { word: 'cut', start: 1.3, end: 1.5, confidence: 1 },
    { word: 'keep', start: 2, end: 2.4, confidence: 1 },
  ];
  const marks: DeletedRange[] = [
    { id: 'one', start: 1, end: 1.2, wordIndices: [1], cutStart: 0.45 },
    { id: 'two', start: 1.3, end: 1.5, wordIndices: [2], cutEnd: 1.95 },
  ];
  const cuts = getEffectiveCutRanges(words, marks, 3);
  assert.deepEqual(cuts, [{ start: 0.45, end: 1.95 }]);
  const single: DeletedRange[] = [{ id: 'both', start: 1, end: 1.5,
    wordIndices: [1, 2], cutStart: 0.45, cutEnd: 1.95 }];
  assert.deepEqual(getEffectiveCutRanges(words, single, 3), [{ start: 0.45, end: 1.95 }]);
  assert.deepEqual(getLockedCutBoundaries(words, single,
    [{ start: 0, end: 0.45 }, { start: 1.95, end: 3 }]),
  { lockedExitIndices: [0], lockedEntranceIndices: [1], lateEntranceIndices: [] });
});
