const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

test('chat restorations update playback, support undo and survive project reload', () => {
  // Bundle the real browser store so Node can load its TypeScript dependencies.
  const output = require('../frontend/node_modules/esbuild').buildSync({
    entryPoints: [path.join(__dirname, '../frontend/src/store/editorStore.ts')],
    bundle: true, platform: 'node', format: 'cjs', write: false,
  }).outputFiles[0].text;
  const storeModule = {exports: {}};
  new Function('require', 'module', 'exports', output)(require, storeModule, storeModule.exports);
  const store = storeModule.exports.useEditorStore;
  const words = Array.from({length: 5}, (_, index) => ({word: 'a', start: index,
    end: index + 0.4, confidence: 1}));
  const original = [{id: 'cut', start: 1, end: 3.4, wordIndices: [1, 2, 3]}];
  store.setState({words, deletedRanges: original, duration: 5});
  store.temporal.getState().clear();
  store.getState().restoreWordRanges([{startIndex: 2, endIndex: 2}]);
  const snapshot = store.getState();
  assert.deepEqual(snapshot.deletedRanges.flatMap(r => r.wordIndices), [1, 3]);
  assert(snapshot.getKeepSegments().some(s => s.start <= 2 && s.end >= 2.4));
  store.temporal.getState().undo();
  assert.deepEqual(store.getState().deletedRanges, original);
  store.temporal.getState().redo();
  assert.deepEqual(store.getState().deletedRanges, snapshot.deletedRanges);
  store.getState().loadProject({videoPath: 'video.mp4', words, deletedRanges: snapshot.deletedRanges});
  assert.deepEqual(store.getState().deletedRanges.flatMap(r => r.wordIndices), [1, 3]);
  const before = store.getState().deletedRanges;
  store.getState().restoreWordRanges([{startIndex: -1, endIndex: 1}]);
  assert.strictEqual(store.getState().deletedRanges, before);
});
