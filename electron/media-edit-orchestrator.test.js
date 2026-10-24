const test = require('node:test');
const assert = require('node:assert/strict');
const {registerMediaOrchestrator} = require('./media-edit-orchestrator');
const words = Array.from({length: 7}, (_, index) => ({id: `w-${index}`, word: 'a',
  start: index, end: index + 0.4}));
const marked = {id: 'cut', start: 1, end: 4.4, wordIndices: [1, 2, 3, 4],
  cutStart: 0.8, cutEnd: 4.8};

test('restoring an interior word splits its cut and preserves only outside overrides', async () => {
  const {restoreMarkedWordRanges} = await import('../shared/word-range-edits.mjs');
  const unrelated = {id: 'other', start: 6, end: 6.4, wordIndices: [6]};
  const original = [marked, unrelated];
  const result = restoreMarkedWordRanges(words, original,
    [{startIndex: 2, endIndex: 2}], () => 'split');
  assert.deepEqual(result, [
    {id: 'cut', start: 1, end: 1.4, wordIndices: [1], cutStart: 0.8},
    {id: 'split', start: 3, end: 4.4, wordIndices: [3, 4], cutEnd: 4.8}, unrelated,
  ]);
  assert.strictEqual(result[2], unrelated);
  assert.deepEqual(original, [marked, unrelated]);
  const {manifestRequest} = require('./manifest-request');
  const request = manifestRequest({words, deletedRanges: result});
  assert(request.keep_segments.some(segment => segment.start <= words[2].start
    && segment.end >= words[2].end));
});

test('overlapping restoration ranges remove all requested marks and can be repeated', async () => {
  const {restoreMarkedWordRanges} = await import('../shared/word-range-edits.mjs');
  const timeCut = {id: 'silence', start: 6.5, end: 6.8, wordIndices: []};
  const ranges = [{startIndex: 1, endIndex: 3}, {startIndex: 2, endIndex: 4}];
  const result = restoreMarkedWordRanges(words, [marked, timeCut], ranges, () => 'split');
  assert.deepEqual(result, [timeCut]);
  assert.strictEqual(restoreMarkedWordRanges(words, result, ranges, () => 'split'), result);
});

test('invalid restoration indices fail before editing marks', async () => {
  const {restoreMarkedWordRanges} = await import('../shared/word-range-edits.mjs');
  for (const [startIndex, endIndex] of [[-1, 0], [3, 2], [0, 7], [true, 1], [1.5, 2]]) {
    assert.throws(() => restoreMarkedWordRanges(words, [marked],
      [{startIndex, endIndex}], () => 'split'), /Invalid word range/);
  }
});

test('restoring either end drops only that end override', async () => {
  const {restoreMarkedWordRanges} = await import('../shared/word-range-edits.mjs');
  assert.deepEqual(restoreMarkedWordRanges(words, [marked],
    [{startIndex: 1, endIndex: 1}], () => 'split'), [
    {id: 'cut', start: 2, end: 4.4, wordIndices: [2, 3, 4], cutEnd: 4.8},
  ]);
  assert.deepEqual(restoreMarkedWordRanges(words, [marked],
    [{startIndex: 4, endIndex: 4}], () => 'split'), [
    {id: 'cut', start: 1, end: 3.4, wordIndices: [1, 2, 3], cutStart: 0.8},
  ]);
});

async function runEdit(actions, checkContext, {initial={},library,fontsUnavailable=false}={}) {
  let handler, document = {revision: 1, videoPath: 'video.mp4', words, deletedRanges: [marked],
    composition: {assets: {}, elements: {}}, chatMessages: [],...initial};
  const commits = [];
  const coordinator = {register: (kind, callback) => {if (kind === 'media-edit') handler = callback;}};
  const repository = {load: () => ({entries: []})};
  let turn = 0;
  const services = {service: async (route, payload) => {
    if (route === '/composition/fonts') {if(fontsUnavailable)throw new Error('font inventory unavailable');return {families:['Arial']};}
    if (route === '/preview/manifest') return {keepSegments: payload.keep_segments};
    assert.equal(route, '/composition/ai-turn');
    checkContext?.(payload, turn);
    return {actions: [actions[turn++]]};
  }};
  registerMediaOrchestrator(coordinator, repository, services,{editingLibrary:library?{read:()=>library}:undefined});
  const context = {initialCheckpoint: {}, jobId: 'job', projectId: 'project',
    assertActive: () => {}, progress: () => {}, checkpoint: () => {}, log: () => {},
    getDocument: () => document, commit: transaction => {
      commits.push(transaction);
      document = {...document, ...transaction.documentChanges, revision: document.revision + 1};
      return {revision: document.revision};
    }};
  const result = await handler({requestId: 'request', message: 'Restaura la paraula 2'}, context);
  return {document, commits, result};
}

test('AI restorations commit alongside cuts and the next observation sees the new timeline', async () => {
  const {document, commits, result} = await runEdit([
    {id: 'edit', type: 'edit', restoreRanges: [{startIndex: 2, endIndex: 2}],
      deleteRanges: [{startIndex: 5, endIndex: 5}]},
    {id: 'done', type: 'done', summary: 'Restaurat'},
  ], (payload, turn) => {
    if (turn === 1) {
      assert.deepEqual(payload.context.deletedIndices.sort(), [1, 3, 4, 5]);
      assert(payload.context.manifest.keepSegments.some(s => s.start <= 2 && s.end >= 2.4));
    }
  });
  assert.equal(result.blocks, 1);
  assert.equal(commits[0].actor, 'ai');
  assert.equal(commits[0].baseRevision, 1);
  assert.equal(commits[0].groupId, 'request');
  assert.deepEqual(document.deletedRanges.flatMap(r => r.wordIndices).sort(), [1, 3, 4, 5]);
});

test('an out-of-bounds restoration does not commit accompanying cuts', async () => {
  const {commits} = await runEdit([
    {id: 'invalid', type: 'edit', restoreRanges: [{startIndex: 7, endIndex: 7}],
      deleteRanges: [{startIndex: 5, endIndex: 5}]},
    {id: 'corrected', type: 'edit', restoreRanges: [{startIndex: 2, endIndex: 2}]},
    {id: 'done', type: 'done', summary: 'Restaurat'},
  ], (payload, turn) => {
    if (turn === 1) {
      assert.deepEqual(payload.context.deletedIndices, [1, 2, 3, 4]);
      assert.match(payload.results.at(-1).error, /Invalid word range/);
    }
  });
  assert.equal(commits.length, 2); // corrected edit and final summary
  assert(!commits[0].documentChanges.deletedRanges.some(r => r.wordIndices.includes(5)));
});

test('AI context exposes user variants and respects deliberately cleared instructions', async()=>{
  const {presetInstance}=require('../shared/composition-runtime.cjs');
  const saved={name:'Entrada personal',preset:presetInstance('pop-in')};
  await runEdit([{id:'done',type:'done',summary:'Fet'}],({context})=>{
    assert.equal(context.mediaInstructions,'');
    assert.equal(context.instructions,'');
    assert.equal(context.capabilities.presetVariants.custom.name,saved.name);
    assert.ok(context.capabilities.fontFamilies.includes('Arial'));
    assert.equal(context.capabilities.defaults.textStyle.color,'#ffffff');
  },{initial:{aiSettings:{editingInstructions:'',mediaInstructions:''},instructionProfile:{text:'Old cleanup',mediaText:'Old style'}},library:{variants:{custom:saved}}});
});

test('font inventory failure does not stop ordinary transcript edits',async()=>{
  const {result}=await runEdit([{id:'edit',type:'edit',restoreRanges:[{startIndex:2,endIndex:2}]},{id:'done',type:'done',summary:'Fet'}],undefined,{fontsUnavailable:true});
  assert.equal(result.blocks,1);
});

test('sidebar AI receives explicit baked-in silence cut provenance', async()=>{
  const clips=[{id:'a',start:0,duration:6,sourceMap:{kind:'silence-processed',marginSeconds:.1,segments:[
    {originalStartUs:0,originalEndUs:2000000,processedStartUs:0,processedEndUs:2000000},
    {originalStartUs:4000000,originalEndUs:8000000,processedStartUs:2000000,processedEndUs:6000000},
  ]}}];
  await runEdit([{id:'done',type:'done',summary:'Fet'}],({context})=>{
    assert.equal(context.editBoundaries.silenceRemovals[0].removedUs,2000000);
    assert.equal(context.editBoundaries.silenceRemovals[0].globalSourceUs,2000000);
    assert.match(context.capabilities.editing.cutProvenance,/B-roll/);
  },{initial:{clips}});
});
