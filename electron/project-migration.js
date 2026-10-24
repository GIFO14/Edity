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
    if (![1,2].includes(project.version) || !Array.isArray(project.words)) continue;
    const relocate = (value) => {
      if (typeof value !== 'string' || !path.isAbsolute(value)) return value;
      const relative = path.relative(oldDir, value);
      return relative && !relative.startsWith('..') && !path.isAbsolute(relative)
        ? path.join(newDir, relative) : value;
    };
    const relocateTree=value=>typeof value==='string'?relocate(value):Array.isArray(value)?value.map(relocateTree):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,child])=>[key,relocateTree(child)])):value;
    const relocated = { ...project,
      videoPath: relocate(project.videoPath),
      sourceVideoPath: relocate(project.sourceVideoPath),
      clips: (project.clips || []).map((clip) => ({ ...clip,
        path: relocate(clip.path), sourcePath: relocate(clip.sourcePath) })),
      mediaItems: (project.mediaItems || []).map((item) => ({ ...item, path: relocate(item.path) })),
    };
    if(relocated.composition)relocated.composition={...relocated.composition,assets:Object.fromEntries(Object.entries(relocated.composition.assets).map(([id,asset])=>[id,{...asset,path:relocate(asset.path),previewPath:relocate(asset.previewPath),thumbnailPath:relocate(asset.thumbnailPath)}]))};
    if(project.processing)relocated.processing=relocateTree(project.processing);
    const journal=path.join(oldDir,'history.jsonl'),journalPrepared=path.join(oldDir,`history.${randomUUID()}.tmp`);
    if(fs.existsSync(journal)){const lines=fs.readFileSync(journal,'utf8').split('\n'),output=[];for(const line of lines){if(!line)continue;try{output.push(JSON.stringify(relocateTree(JSON.parse(line))));}catch{break;}}fs.writeFileSync(journalPrepared,output.join('\n')+'\n','utf8');}
    // Prepare the replacement metadata before moving large video files. If a
    // file is still locked by the old application, leave that whole project in
    // place to retry on the next launch.
    const prepared = path.join(oldDir, `${PROJECT_NAME}.${randomUUID()}.tmp`);
    fs.writeFileSync(prepared, JSON.stringify(relocated, null, 2), 'utf8');
    try {
      fs.renameSync(oldDir, newDir);
      const movedPrepared = path.join(newDir, path.basename(prepared));
      fs.renameSync(movedPrepared, path.join(newDir, PROJECT_NAME));
      const movedJournal=path.join(newDir,path.basename(journalPrepared));if(fs.existsSync(movedJournal))fs.renameSync(movedJournal,path.join(newDir,'history.jsonl'));
      const legacy = path.join(newDir, LEGACY_PROJECT_NAME);
      if (fs.existsSync(legacy)) fs.unlinkSync(legacy);
    } catch (error) {
      if (fs.existsSync(prepared)) fs.unlinkSync(prepared);
      if(fs.existsSync(journalPrepared))fs.unlinkSync(journalPrepared);
      // The rename of a directory and its metadata are two filesystem operations.
      // If the second failed, keep the moved project readable for the next launch.
      if (fs.existsSync(newDir)) {
        const movedPrepared = path.join(newDir, path.basename(prepared));
        try {
          if (fs.existsSync(movedPrepared)) fs.renameSync(movedPrepared, path.join(newDir, PROJECT_NAME));
        const movedJournal=path.join(newDir,path.basename(journalPrepared));if(fs.existsSync(movedJournal))fs.renameSync(movedJournal,path.join(newDir,'history.jsonl'));
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
