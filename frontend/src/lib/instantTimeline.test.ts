import test from 'node:test';
import assert from 'node:assert/strict';
import { playableSourceTime, editedOffsetAt, sourceAtEditedOffset } from './instantTimeline.ts';

test('a newly removed word disappears from the live timeline immediately', () => {
  const before = [{ start: 0, end: 4 }];
  const after = [{ start: 0, end: 1 }, { start: 2, end: 4 }];
  assert.equal(sourceAtEditedOffset(before, 1.2), 1.2);
  assert.equal(sourceAtEditedOffset(after, 1.2), 2.2);
  assert.equal(playableSourceTime(after, 1.2), 2);
  assert.ok(Math.abs(editedOffsetAt(after, 2.2) - 1.2) < 1e-9);
});

test('restoring a word restores its place without rebuilding a video', () => {
  const cut = [{ start: 0, end: 1 }, { start: 2, end: 4 }];
  const restored = [{ start: 0, end: 4 }];
  assert.equal(playableSourceTime(cut, 1.5), 2);
  assert.equal(playableSourceTime(restored, 1.5), 1.5);
});
