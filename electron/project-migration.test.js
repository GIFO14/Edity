const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { migrateLegacyProjects, migrateLegacyUserData } = require('./project-migration');
const { createProjectStore } = require('./project-store');

test('migrates an existing library, its managed paths, and preferences', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'edity-migration-'));
  try {
    const documents = path.join(root, 'Documents');
    const oldDir = path.join(documents, 'CutScript', 'Projects', 'sample');
    fs.mkdirSync(path.join(oldDir, 'clips'), { recursive: true });
    fs.writeFileSync(path.join(oldDir, 'video.mp4'), 'video');
    fs.writeFileSync(path.join(oldDir, 'clips', 'one.mp4'), 'clip');
    const project = { version: 1, id: 'sample', title: 'Sample', words: [], segments: [],
      deletedRanges: [], videoPath: path.join(oldDir, 'video.mp4'),
      sourceVideoPath: path.join(root, 'original.mp4'),
      clips: [{ path: path.join(oldDir, 'clips', 'one.mp4'), sourcePath: path.join(root, 'original.mp4') }],
      mediaItems: [], modifiedAt: new Date().toISOString() };
    fs.writeFileSync(path.join(oldDir, 'project.aive'), JSON.stringify(project));
    const newRoot = migrateLegacyProjects(documents);
    const opened = createProjectStore(newRoot).open('sample');
    assert.equal(fs.readFileSync(opened.videoPath, 'utf8'), 'video');
    assert.equal(fs.readFileSync(opened.clips[0].path, 'utf8'), 'clip');
    assert.equal(opened.sourceVideoPath, project.sourceVideoPath);
    assert.ok(fs.existsSync(path.join(newRoot, 'sample', 'project.edity')));
    assert.equal(fs.existsSync(oldDir), false);
    assert.equal(migrateLegacyProjects(documents), newRoot);

    const appData = path.join(root, 'AppData');
    fs.mkdirSync(path.join(appData, 'CutScript', 'Local Storage'), { recursive: true });
    fs.writeFileSync(path.join(appData, 'CutScript', 'Local Storage', 'settings'), 'saved');
    migrateLegacyUserData(appData);
    assert.equal(fs.readFileSync(path.join(appData, 'Edity', 'Local Storage', 'settings'), 'utf8'), 'saved');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
