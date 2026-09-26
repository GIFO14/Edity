const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createProjectStore } = require('./project-store');

test('a project survives reopening with edits, video and media in its directory', async () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'edity-project-test-'));
  try {
    const source = path.join(sandbox, 'recording.mp4');
    const image = path.join(sandbox, 'image.png');
    fs.writeFileSync(source, 'video bytes');
    fs.writeFileSync(image, 'image bytes');
    const root = path.join(sandbox, 'Documents', 'Edity', 'Projects');
    const store = createProjectStore(root);
    const copyProgress = [];
    const project = await store.create(source, {}, (progress) => copyProgress.push(progress.progress));
    assert.equal(copyProgress[0], 0);
    assert.equal(copyProgress.at(-1), 100);
    assert.equal(fs.readFileSync(project.videoPath, 'utf8'), 'video bytes');
    assert.equal(store.list()[0].id, project.id);

    const mediaPath = await store.copyAsset(project.id, image);
    assert.equal(fs.readFileSync(mediaPath, 'utf8'), 'image bytes');
    fs.writeFileSync(path.join(root, project.id, 'project.edity'),
      JSON.stringify({ ...store.open(project.id), editingInstructions: 'Keep the best complete take' }));
    assert.equal(store.open(project.id).editingInstructions, 'Keep the best complete take');
    store.save(project.id, {
      words: [{ word: 'hola', start: 0, end: 0.4, confidence: 1 }],
      segments: [],
      deletedRanges: [{ id: 'cut-1', start: 0, end: 0.4, wordIndices: [0] }],
      soundEvents: [{ id: 'sound-1', label: 'Cough', start: 1, end: 1.4, confidence: 0.91,
        source: 'panns', overlapsSpeech: false, markedForRemoval: true }],
      mediaItems: [{ id: 'image-1', type: 'image', path: mediaPath, start: 0, end: 2, volume: 1 }],
      chatMessages: [{ id: 'chat-1', role: 'user', text: 'Keep the last take', createdAt: '2026-09-24T00:00:00Z' }],
      studioSoundEnabled: true,
      language: 'ca',
      playhead: 12.5,
    });

    const reopened = createProjectStore(root).open(project.id);
    assert.equal(reopened.words[0].word, 'hola');
    assert.equal(reopened.deletedRanges[0].id, 'cut-1');
    assert.equal(reopened.soundEvents[0].label, 'Cough');
    assert.equal(reopened.soundEvents[0].markedForRemoval, true);
    assert.equal(reopened.mediaItems[0].path, mediaPath);
    assert.equal(reopened.chatMessages[0].text, 'Keep the last take');
    assert.equal(reopened.studioSoundEnabled, true);
    assert.equal(reopened.editingInstructions, undefined);
    assert.equal(reopened.playhead, 12.5);
    assert.equal(reopened.createdAt, project.createdAt);
    assert.equal(fs.readFileSync(reopened.videoPath, 'utf8'), 'video bytes');
    assert.throws(() => store.open('../other'), /Invalid project ID/);
  } finally {
    assert.equal(path.dirname(fs.realpathSync(sandbox)), fs.realpathSync(os.tmpdir()));
    assert.match(path.basename(sandbox), /^edity-project-test-/);
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('project actions preserve edits and exported archives survive library deletion', async () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'edity-actions-test-'));
  try {
    const root = path.join(sandbox, 'Projects');
    const video = path.join(sandbox, 'original.mp4');
    const image = path.join(sandbox, 'picture.png');
    const archive = path.join(sandbox, 'saved-project.edity');
    fs.writeFileSync(video, 'original video bytes');
    fs.writeFileSync(image, 'image bytes');
    const store = createProjectStore(root);
    const project = await store.create(video);
    const mediaPath = await store.copyAsset(project.id, image);
    store.save(project.id, {
      words: [{ word: 'hello', start: 0, end: 0.3, confidence: 1 }],
      segments: [], deletedRanges: [{ id: 'mark-1', start: 0, end: 0.3, wordIndices: [0] }],
      soundEvents: [{ id: 'burp-1', label: 'Burping, eructation', start: 2, end: 2.5,
        confidence: 0.88, source: 'panns', overlapsSpeech: false, markedForRemoval: true }],
      mediaItems: [{ id: 'media-1', type: 'image', path: mediaPath, start: 0, end: 1, volume: 1 }],
      chatMessages: [{ id: 'chat-1', role: 'user', text: 'Keep the last take', createdAt: new Date().toISOString() }],
      language: 'en', playhead: 0.2,
    });
    assert.equal(store.rename(project.id, 'My video').title, 'My video');
    assert.equal(store.list()[0].title, 'My video');

    const copy = await store.duplicate(project.id);
    assert.notEqual(copy.id, project.id);
    assert.equal(copy.title, 'My video (copy)');
    assert.equal(copy.deletedRanges[0].id, 'mark-1');
    assert.equal(copy.soundEvents[0].id, 'burp-1');
    assert.equal(copy.chatMessages[0].text, 'Keep the last take');
    assert.equal(fs.readFileSync(copy.videoPath, 'utf8'), 'original video bytes');
    assert.equal(fs.readFileSync(copy.mediaItems[0].path, 'utf8'), 'image bytes');
    assert.notEqual(copy.videoPath, project.videoPath);
    assert.notEqual(copy.mediaItems[0].path, mediaPath);

    fs.writeFileSync(path.join(root, copy.id, 'project.edity'),
      JSON.stringify({ ...store.open(copy.id), editingInstructions: 'Old project-only setting' }));

    await store.exportProject(copy.id, archive);
    assert.equal(fs.readFileSync(archive).subarray(0, 2).toString(), 'PK');
    await assert.rejects(store.exportProject(copy.id, path.join(root, 'unsafe.edity')), /outside the project library/);
    await store.remove(copy.id, (directory) => fs.promises.rm(directory, { recursive: true }));
    assert.equal(store.list().length, 1);
    const imported = await store.importProject(archive);
    assert.notEqual(imported.id, copy.id);
    assert.equal(imported.title, copy.title);
    assert.equal(imported.deletedRanges[0].id, 'mark-1');
    assert.equal(imported.soundEvents[0].label, 'Burping, eructation');
    assert.equal(imported.editingInstructions, undefined);
    assert.equal(fs.readFileSync(imported.videoPath, 'utf8'), 'original video bytes');
    assert.equal(fs.readFileSync(imported.mediaItems[0].path, 'utf8'), 'image bytes');
    const legacyFile = path.join(sandbox, 'legacy.aive');
    fs.writeFileSync(legacyFile, JSON.stringify(store.open(project.id)));
    const legacyImported = await store.importProject(legacyFile);
    assert.equal(legacyImported.title, 'My video');
    assert.equal(legacyImported.words[0].word, 'hello');
    assert.throws(() => store.rename(project.id, ' '), /project name/i);
    await assert.rejects(store.remove('../outside', () => {}), /Invalid project ID/);
    assert.equal(fs.readFileSync(video, 'utf8'), 'original video bytes');
  } finally {
    assert.equal(path.dirname(fs.realpathSync(sandbox)), fs.realpathSync(os.tmpdir()));
    assert.match(path.basename(sandbox), /^edity-actions-test-/);
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('a busy video cannot erase project metadata during deletion retry', async () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'edity-delete-test-'));
  try {
    const source = path.join(sandbox, 'original.mp4');
    fs.writeFileSync(source, 'video bytes');
    const store = createProjectStore(path.join(sandbox, 'Projects'));
    const project = await store.create(source);
    let attempts = 0;
    await store.remove(project.id, async (directory) => {
      attempts++;
      if (attempts === 1) {
        assert.equal(store.open(project.id).videoPath, project.videoPath);
        assert.equal(fs.readFileSync(project.videoPath, 'utf8'), 'video bytes');
        const error = new Error('video is busy');
        error.code = 'EBUSY';
        throw error;
      }
      await fs.promises.rm(directory, { recursive: true });
    });
    assert.equal(attempts, 2);
    assert.equal(store.list().length, 0);
    assert.equal(fs.readFileSync(source, 'utf8'), 'video bytes');
  } finally {
    assert.equal(path.dirname(fs.realpathSync(sandbox)), fs.realpathSync(os.tmpdir()));
    assert.match(path.basename(sandbox), /^edity-delete-test-/);
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('a persistently locked project is hidden and deleted by a later cleanup', async () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'edity-deferred-delete-test-'));
  try {
    const source = path.join(sandbox, 'original.mp4');
    fs.writeFileSync(source, 'video bytes');
    const root = path.join(sandbox, 'Projects');
    const store = createProjectStore(root);
    const project = await store.create(source);
    const busy = new Error('resource busy or locked');
    busy.code = 'EBUSY';
    const result = await store.remove(project.id, async () => { throw busy; });

    assert.deepEqual(result, { pending: true });
    assert.equal(store.list().length, 0);
    assert.equal(fs.readFileSync(path.join(root, project.id, 'project.edity'), 'utf8').includes(project.id), true);
    assert.equal(fs.readFileSync(project.videoPath, 'utf8'), 'video bytes');

    await createProjectStore(root).cleanupPending(async (directory) => {
      await fs.promises.rm(directory, { recursive: true });
    });
    assert.equal(fs.existsSync(path.join(root, project.id)), false);
    assert.equal(fs.existsSync(path.join(root, '.pending-deletions.json')), false);
  } finally {
    assert.equal(path.dirname(fs.realpathSync(sandbox)), fs.realpathSync(os.tmpdir()));
    assert.match(path.basename(sandbox), /^edity-deferred-delete-test-/);
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('project clips are managed separately and can be removed recoverably', async () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'edity-clips-test-'));
  try {
    const first = path.join(sandbox, 'intro.mp4');
    const second = path.join(sandbox, 'chapter.mp4');
    fs.writeFileSync(first, 'intro bytes');
    fs.writeFileSync(second, 'chapter bytes');
    const store = createProjectStore(path.join(sandbox, 'Projects'));
    const project = await store.create(first);
    const copyProgress = [];
    const added = await store.addClip(project.id, second, 'Chapter 1', (event) => copyProgress.push(event.progress));
    assert.equal(added.project.clips.length, 2);
    assert.equal(added.clip.name, 'Chapter 1');
    assert.equal(fs.readFileSync(added.project.clips[0].path, 'utf8'), 'intro bytes');
    assert.equal(fs.readFileSync(added.clip.path, 'utf8'), 'chapter bytes');
    assert.notEqual(added.project.clips[0].path, added.project.videoPath);
    assert.equal(copyProgress[0], 0);
    assert.equal(copyProgress.at(-1), 100);
    const archive = path.join(sandbox, 'clips.edity');
    await store.exportProject(project.id, archive);
    const imported = await store.importProject(archive);
    assert.equal(imported.clips.length, 2);
    assert.equal(fs.readFileSync(imported.clips[0].path, 'utf8'), 'intro bytes');
    assert.equal(fs.readFileSync(imported.clips[1].path, 'utf8'), 'chapter bytes');
    let trashed = '';
    const updated = await store.removeClip(project.id, added.clip.id, async (file) => {
      trashed = file;
      await fs.promises.rm(file);
    });
    assert.equal(updated.clips.length, 1);
    assert.equal(trashed, added.clip.path);
    await assert.rejects(store.removeClip(project.id, updated.clips[0].id, async () => {}),
      /at least one clip/);
    assert.equal(fs.readFileSync(first, 'utf8'), 'intro bytes');
    assert.equal(fs.readFileSync(second, 'utf8'), 'chapter bytes');
  } finally {
    assert.equal(path.dirname(fs.realpathSync(sandbox)), fs.realpathSync(os.tmpdir()));
    assert.match(path.basename(sandbox), /^edity-clips-test-/);
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
