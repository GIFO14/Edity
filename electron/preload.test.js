const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('sandboxed preload exposes projects and forwards import progress', async () => {
  let api;
  const listeners = new Map();
  const channels = [];
  const ipcRenderer = {
    on(channel, listener) { listeners.set(channel, listener); },
    removeListener(channel, listener) {
      assert.equal(listeners.get(channel), listener);
      listeners.delete(channel);
    },
    async invoke(operation, ...args) {
      if (operation === 'projects:create' || operation === 'projects:addClip') {
        const channel = args.at(-1);
        channels.push(channel);
        listeners.get(channel)(null, { percent: 50 });
      }
      return { operation };
    },
  };
  const source = fs.readFileSync(path.join(__dirname, 'preload.js'), 'utf8');

  vm.runInNewContext(source, {
    require(module) {
      assert.equal(module, 'electron', 'sandboxed preload only permits Electron here');
      return {
        contextBridge: { exposeInMainWorld(name, value) {
          assert.equal(name, 'electronAPI');
          api = value;
        } },
        ipcRenderer,
      };
    },
  });

  assert.equal(typeof api.listProjects, 'function');
  const progress = [];
  await api.createManagedProject('video.mp4', {}, (value) => progress.push(value.percent));
  await api.addProjectClip('project', 'clip.mp4', 'Clip', (value) => progress.push(value.percent));
  assert.deepEqual(progress, [50, 50]);
  assert.equal(new Set(channels).size, 2);
  assert.equal(listeners.size, 0);
});
