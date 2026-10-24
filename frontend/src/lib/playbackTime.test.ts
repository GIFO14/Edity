import test from 'node:test';
import assert from 'node:assert/strict';
import { playbackTimeFor, seekSourceTime, setPlaybackTimeline, sourceTimeAt } from './playbackTime.ts';

test('cut preview maps source words and seeks across a removed take', () => {
  const video = Object.assign(new EventTarget(),{currentTime:0}) as HTMLVideoElement;
  let seeks=0;video.addEventListener('edity-seek',()=>seeks++);
  setPlaybackTimeline(video, [{ start: 0, end: 12.54 }, { start: 15.5, end: 20 }]);
  assert.ok(Math.abs(playbackTimeFor(video, 15.6) - 12.64) < 1e-9);
  seekSourceTime(video, 15.6);
  assert.equal(seeks,1);
  assert.ok(Math.abs(video.currentTime - 12.64) < 1e-9);
  assert.ok(Math.abs(sourceTimeAt(video) - 15.6) < 1e-9);
  video.currentTime = 12.54;
  assert.equal(sourceTimeAt(video), 15.5);
  setPlaybackTimeline(video, null);
  assert.equal(sourceTimeAt(video), 12.54);
});
