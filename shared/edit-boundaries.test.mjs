import test from 'node:test';
import assert from 'node:assert/strict';
import {editBoundaries,baseTimelineSegments} from './edit-boundaries.mjs';
const document={clips:[{id:'a',start:10,sourceMap:{kind:'silence-processed',marginSeconds:.1,segments:[
  {originalStartUs:0,originalEndUs:2000000,processedStartUs:0,processedEndUs:2000000},
  {originalStartUs:4000000,originalEndUs:6000000,processedStartUs:2000000,processedEndUs:4000000},
  {originalStartUs:7000000,originalEndUs:8000000,processedStartUs:4000000,processedEndUs:5000000},
]}}]};
test('Auto-Editor cuts retain original gaps and separate clip, global and edited clocks',()=>{
  const result=editBoundaries(document,{segments:[{clipId:'a',globalSourceStartUs:11000000,sourceStartUs:1000000,sourceEndUs:3500000,editStartUs:0,editEndUs:2500000}]});
  assert.equal(result.silenceRemovals.length,2);
  assert.deepEqual(result.silenceRemovals[0],{id:'silence:a:2000000',kind:'silence-removal',clipId:'a',processedSourceUs:2000000,globalSourceUs:12000000,originalStartUs:2000000,originalEndUs:4000000,removedUs:2000000,marginSecondsPerSide:.1,editTimesUs:[1000000],visible:true});
  assert.deepEqual(result.silenceRemovals[1].editTimesUs,[]);
  assert.equal(result.silenceRemovals[1].visible,false);
});
test('reordering maps each occurrence rather than treating source seconds as playback seconds',()=>{
  const s={clipId:'a',globalSourceStartUs:11000000,sourceStartUs:1000000,sourceEndUs:3500000,editStartUs:0,editEndUs:2500000};
  const result=editBoundaries(document,{segments:[s,{...s,editStartUs:2500000,editEndUs:5000000}]});
  assert.deepEqual(result.silenceRemovals[0].editTimesUs,[1000000,3500000]);
  assert.equal(result.timelineCuts[0].kind,'narration-reorder');
});
test('missing maps remain unknown; context without a manifest has no fabricated playback position',()=>{
  assert.equal(editBoundaries(document).silenceRemovals[0].editTimesUs,null);
  assert.deepEqual(editBoundaries({clips:[{id:'legacy',start:0}]}).mapStatus,[{clipId:'legacy',status:'unavailable'}]);
  assert.deepEqual(editBoundaries({clips:[{id:'legacy',start:0}]}).silenceRemovals,[]);
});

test('locked base pieces partition all silence and marked-range cuts without changing duration',()=>{
  const manifest={durationUs:4000000,segments:[{clipId:'a',globalSourceStartUs:10000000,sourceStartUs:0,sourceEndUs:3000000,editStartUs:0,editEndUs:3000000},{clipId:'a',globalSourceStartUs:14000000,sourceStartUs:4000000,sourceEndUs:5000000,editStartUs:3000000,editEndUs:4000000}]};
  const boundaries=editBoundaries(document,manifest),before=JSON.stringify(manifest);
  const pieces=baseTimelineSegments(manifest,boundaries);
  assert.deepEqual(pieces.map(p=>[p.startUs,p.endUs]),[[0,2000000],[2000000,3000000],[3000000,4000000]]);
  assert.ok(pieces[1].cutKinds.includes('silence-removal'));
  assert.ok(pieces[2].cutKinds.includes('edit-removal'));
  assert.ok(pieces[2].cutKinds.includes('silence-removal'));
  assert.equal(pieces.reduce((sum,p)=>sum+p.endUs-p.startUs,0),manifest.durationUs);
  assert.equal(JSON.stringify(manifest),before);
});

test('base pieces retain sub-frame cuts and clip/reorder boundaries; missing silence maps invent none',()=>{
  const manifest={durationUs:10,segments:[{clipId:'b',globalSourceStartUs:100,sourceStartUs:0,sourceEndUs:5,editStartUs:0,editEndUs:5},{clipId:'a',globalSourceStartUs:0,sourceStartUs:0,sourceEndUs:5,editStartUs:5,editEndUs:10}]};
  const boundaries=editBoundaries({clips:[]},manifest);boundaries.silenceRemovals=[{editTimesUs:[4,5,10]}];
  const pieces=baseTimelineSegments(manifest,boundaries);
  assert.deepEqual(pieces.map(p=>[p.startUs,p.endUs,p.clipId]),[[0,4,'b'],[4,5,'b'],[5,10,'a']]);
  assert.ok(pieces[2].cutKinds.includes('clip-boundary'));
  assert.deepEqual(baseTimelineSegments(null,boundaries),[]);
});
