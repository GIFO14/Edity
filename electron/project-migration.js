const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const PROJECT_NAME = 'project.edity';
const LEGACY_PROJECT_NAME = 'project.aive';

function migrateLegacyProjects(documents) {
  const oldRoot = path.join(documents, 'CutScript', 'Projects');
  const newRoot = path.join(documents, 'Edity', 'Projects');
  if (!fs.existsSync(oldRoot)) return newRoot;
  fs.mkdirSync(newRoot, { recursive: true });
  const pending = '.pending-deletions.json';
  if (fs.existsSync(path.join(oldRoot, pending)) && !fs.existsSync(path.join(newRoot, pending))) {
    fs.copyFileSync(path.join(oldRoot, pending), path.join(newRoot, pending));
  }

  for (const entry of fs.readdirSync(oldRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-z0-9_-]{1,100}$/i.test(entry.name)) continue;
    const oldDir = path.join(oldRoot, entry.name);
    const newDir = path.join(newRoot, entry.name);
    if (fs.existsSync(newDir)) continue;
    const oldFile = [PROJECT_NAME, LEGACY_PROJECT_NAME]
      .map((name) => path.join(oldDir, name)).find((file) => fs.existsSync(file));
    if (!oldFile) continue;
    let project;
    try { project = JSON.parse(fs.readFileSync(oldFile, 'utf8')); } catch { continue; }
    if (project.version !== 1 || !Array.isArray(project.words)) continue;
    const relocate = (value) => {
      if (typeof value !== 'string' || !path.isAbsolute(value)) return value;
      const relative = path.relative(oldDir, value);
      return relative && !relative.startsWith('..') && !path.isAbsolute(relative)
        ? path.join(newDir, relative) : value;
    };
    const relocated = { ...project,
      videoPath: relocate(project.videoPath),
      sourceVideoPath: relocate(project.sourceVideoPath),
      clips: (project.clips || []).map((clip) => ({ ...clip,
        path: relocate(clip.path), sourcePath: relocate(clip.sourcePath) })),
      mediaItems: (project.mediaItems || []).map((item) => ({ ...item, path: relocate(item.path) })),
    };
    // Prepare the replacement metadata before moving large video files. If a
    // file is still locked by the old application, leave that whole project in
    // place to retry on the next launch.
    const prepared = path.join(oldDir, `${PROJECT_NAME}.${randomUUID()}.tmp`);
    fs.writeFileSync(prepared, JSON.stringify(relocated, null, 2), 'utf8');
    try {
      fs.renameSync(oldDir, newDir);
      const movedPrepared = path.join(newDir, path.basename(prepared));
      fs.renameSync(movedPrepared, path.join(newDir, PROJECT_NAME));
      const legacy = path.join(newDir, LEGACY_PROJECT_NAME);
      if (fs.existsSync(legacy)) fs.unlinkSync(legacy);
    } catch (error) {
      if (fs.existsSync(prepared)) fs.unlinkSync(prepared);
      // The rename of a directory and its metadata are two filesystem operations.
      // If the second failed, keep the moved project readable for the next launch.
      if (fs.existsSync(newDir)) {
        const movedPrepared = path.join(newDir, path.basename(prepared));
        try {
          if (fs.existsSync(movedPrepared)) fs.renameSync(movedPrepared, path.join(newDir, PROJECT_NAME));
        } catch { /* project.aive remains readable by project-store */ }
      }
      console.warn(`Could not migrate project ${entry.name}:`, error);
    }
  }
  return newRoot;
}

function migrateLegacyUserData(appData) {
  const previous = path.join(appData, 'CutScript');
  const current = path.join(appData, 'Edity');
  if (!fs.existsSync(previous)) return;
  try {
    fs.mkdirSync(current, { recursive: true });
    for (const name of ['Local Storage']) {
      const source = path.join(previous, name);
      const destination = path.join(current, name);
      if (fs.existsSync(source) && !fs.existsSync(destination)) {
        fs.cpSync(source, destination, { recursive: true });
      }
    }
  } catch (error) {
    console.warn('Could not migrate local preferences:', error);
  }
}

module.exports = { migrateLegacyProjects, migrateLegacyUserData, PROJECT_NAME, LEGACY_PROJECT_NAME };
