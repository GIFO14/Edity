const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { writeProjectArchive, extractProjectArchive, isZipArchive, archiveName } = require('./project-archive');
const { PROJECT_NAME, LEGACY_PROJECT_NAME } = require('./project-migration');

function createProjectStore(root) {
  let commitHandler=null;
  fs.mkdirSync(root, { recursive: true });
  const pendingFile = path.join(root, '.pending-deletions.json');

  function readPending() {
    try {
      const ids = JSON.parse(fs.readFileSync(pendingFile, 'utf8'));
      return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string'
        && /^[a-z0-9_-]{1,100}$/i.test(id)) : []);
    } catch {
      return new Set();
    }
  }

  function writePending(ids) {
    const values = [...ids];
    if (!values.length) {
      try { fs.unlinkSync(pendingFile); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      return;
    }
    const temporary = `${pendingFile}.${randomUUID()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(values, null, 2), 'utf8');
    fs.renameSync(temporary, pendingFile);
  }

  function setPending(id, pending) {
    const ids = readPending();
    if (pending) ids.add(id); else ids.delete(id);
    writePending(ids);
  }

  function isBusyError(error) {
    return ['EBUSY', 'EPERM', 'EACCES'].includes(error?.code)
      || /resource busy|used by another process|being used|locked|access is denied|eperm|ebusy/i
        .test(String(error?.message || error));
  }

  function projectDir(id) {
    if (typeof id !== 'string' || !/^[a-z0-9_-]{1,100}$/i.test(id)) {
      throw new Error('Invalid project ID');
    }
    return path.join(root, id);
  }

  function projectFile(id) {
    return path.join(projectDir(id), PROJECT_NAME);
  }

  function readableProjectFile(id) {
    const current = projectFile(id);
    if (fs.existsSync(current)) return current;
    return path.join(projectDir(id), LEGACY_PROJECT_NAME);
  }

  async function copyFileWithProgress(source, destination, onProgress) {
    const total = (await fs.promises.stat(source)).size;
    let copied = 0;
    let lastProgress = -1;
    const counter = new Transform({
      transform(chunk, _encoding, callback) {
        copied += chunk.length;
        const progress = total ? Math.min(100, Math.round(100 * copied / total)) : 100;
        if (progress !== lastProgress) {
          onProgress?.({ progress, copied, total });
          lastProgress = progress;
        }
        callback(null, chunk);
      },
    });
    onProgress?.({ progress: 0, copied: 0, total });
    await pipeline(fs.createReadStream(source), counter, fs.createWriteStream(destination, { flags: 'wx' }));
    if (lastProgress !== 100) onProgress?.({ progress: 100, copied: total, total });
  }

  function checkManagedDirectory(id) {
    const directory = projectDir(id);
    const relative = path.relative(fs.realpathSync(root), fs.realpathSync(directory));
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)
      || fs.lstatSync(directory).isSymbolicLink()) {
      throw new Error('Project directory is outside the project library');
    }
    return directory;
  }

  function newId(title) {
    const slug = title.normalize('NFKD').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').slice(0, 48) || 'video';
    let id;
    do { id = `${slug}-${randomUUID().slice(0, 8)}`; } while (fs.existsSync(projectDir(id)));
    return id;
  }

  function open(id) {
    const data = JSON.parse(fs.readFileSync(readableProjectFile(id), 'utf8'));
    if (![1,2].includes(data.version) || !Array.isArray(data.words) || !Array.isArray(data.deletedRanges)) {
      throw new Error('Invalid project file');
    }
    return data;
  }

  function writeProject(id, data) {
    const file = projectFile(id);
    if(commitHandler&&fs.existsSync(file)&&JSON.parse(fs.readFileSync(file,'utf8')).id===data.id)return commitHandler(id,data);
    const temporary = `${file}.${randomUUID()}.tmp`;
    const { editingInstructions: _legacyInstructions, ...projectData } = data;
    try {
      fs.writeFileSync(temporary, JSON.stringify(projectData, null, 2), 'utf8');
      fs.renameSync(temporary, file);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }

  async function copyAsset(id, sourcePath) {
    if (!fs.existsSync(readableProjectFile(id)) && !fs.existsSync(projectDir(id))) {
      throw new Error('Project not found');
    }
    if (typeof sourcePath !== 'string' || !(await fs.promises.stat(sourcePath)).isFile()) {
      throw new Error('Media file not found');
    }
    const mediaDir = path.join(projectDir(id), 'media');
    const relative = path.relative(mediaDir, path.resolve(sourcePath));
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
      return path.resolve(sourcePath);
    }
    fs.mkdirSync(mediaDir, { recursive: true });
    const extension = path.extname(sourcePath).toLowerCase();
    const destination = path.join(mediaDir, `${randomUUID()}${extension}`);
    await fs.promises.copyFile(sourcePath, destination, fs.constants.COPYFILE_EXCL);
    return destination;
  }

  async function copyClipFile(id, sourcePath, onProgress) {
    if (typeof sourcePath !== 'string' || !(await fs.promises.stat(sourcePath)).isFile()) {
      throw new Error('Video clip not found');
    }
    const clipsDir = path.join(projectDir(id), 'clips');
    fs.mkdirSync(clipsDir, { recursive: true });
    const extension = path.extname(sourcePath).toLowerCase();
    const destination = path.join(clipsDir, `${randomUUID()}${extension}`);
    await copyFileWithProgress(sourcePath, destination, onProgress);
    return destination;
  }

  async function addClip(id, sourcePath, displayName, onProgress) {
    const project = open(id);
    let clips = Array.isArray(project.clips) ? [...project.clips] : [];
    if (!clips.length) {
      const firstPath = await copyClipFile(id, project.videoPath);
      clips.push({ id: `legacy_${id}`, name: path.basename(project.sourceVideoPath || project.videoPath),
        path: firstPath, sourcePath: project.sourceVideoPath, start: 0, duration: 0 });
    } else if (clips.length === 1 && path.resolve(clips[0].path) === path.resolve(project.videoPath)) {
      clips[0] = { ...clips[0], path: await copyClipFile(id, project.videoPath) };
    }
    const managedPath = await copyClipFile(id, sourcePath, onProgress);
    const clip = { id: randomUUID(), name: (typeof displayName === 'string' && displayName.trim())
      || path.basename(sourcePath), path: managedPath, sourcePath: path.resolve(sourcePath), start: 0, duration: 0 };
    clips.push(clip);
    const updated = { ...project, clips, modifiedAt: new Date().toISOString() };
    writeProject(id, updated);
    return { project: updated, clip };
  }

  async function removeClip(id, clipId, trashItem) {
    const project = open(id);
    const clips = Array.isArray(project.clips) ? project.clips : [];
    if (clips.length <= 1) throw new Error('A project must contain at least one clip');
    const clip = clips.find((item) => item.id === clipId);
    if (!clip) throw new Error('Clip not found');
    const relative = path.relative(projectDir(id), path.resolve(clip.path));
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Clip is outside the project directory');
    }
    const updated = { ...project, clips: clips.filter((item) => item.id !== clipId),
      modifiedAt: new Date().toISOString() };
    writeProject(id, updated);
    if (fs.existsSync(clip.path) && typeof trashItem === 'function') await trashItem(clip.path);
    return updated;
  }

  async function create(sourcePath, initial = {}, onProgress) {
    if (typeof sourcePath !== 'string' || !(await fs.promises.stat(sourcePath)).isFile()) {
      throw new Error('Video file not found');
    }
    const originalName = path.basename(sourcePath, path.extname(sourcePath));
    const title = typeof initial.title === 'string' && initial.title.trim()
      ? initial.title.trim() : originalName.replace(/_(?:edity|cutscript)_silence(?:_\d+)?$/i, '') || 'Untitled video';
    const id = newId(title);
    const directory = projectDir(id);
    fs.mkdirSync(directory);
    const videoPath = path.join(directory, `video${path.extname(sourcePath).toLowerCase()}`);
    await copyFileWithProgress(sourcePath, videoPath, onProgress);

    const mediaItems = [];
    for (const item of (Array.isArray(initial.mediaItems) ? initial.mediaItems : [])) {
      try {
        mediaItems.push({ ...item, path: await copyAsset(id, item.path) });
      } catch {
        mediaItems.push(item);
      }
    }
    const now = new Date().toISOString();
    const project = {
      version: 1, id, title, videoPath,
      sourceVideoPath: path.resolve(sourcePath),
      clips: [{ id: randomUUID(), name: path.basename(sourcePath), path: videoPath,
        sourcePath: path.resolve(sourcePath), start: 0, duration: 0 }],
      mediaFolders: initial.mediaFolders || { image: '', broll: '', music: '' },
      studioSoundEnabled: initial.studioSoundEnabled === true,
      words: Array.isArray(initial.words) ? initial.words : [],
      segments: Array.isArray(initial.segments) ? initial.segments : [],
      deletedRanges: Array.isArray(initial.deletedRanges) ? initial.deletedRanges : [],
      soundEvents: Array.isArray(initial.soundEvents) ? initial.soundEvents : [],
      mediaItems,
      chatMessages: Array.isArray(initial.chatMessages) ? initial.chatMessages : [],
      aiSettings:initial.aiSettings||{editingInstructions:initial.editingInstructions||'',mediaInstructions:'',customFillerWords:''},
      processing:initial.processing,
      ...(initial.narration?{narration:initial.narration}:{}),
      language: typeof initial.language === 'string' ? initial.language : '',
      playhead: Number.isFinite(initial.playhead) ? Math.max(0, initial.playhead) : 0,
      createdAt: typeof initial.createdAt === 'string' ? initial.createdAt : now,
      modifiedAt: now,
    };
    if(initial.version===2&&initial.composition){
      project.version=2;project.revision=0;project.transcriptRevision=initial.transcriptRevision||0;
      project.composition=structuredClone(initial.composition);project.instructionProfile=initial.instructionProfile;
      for(const asset of Object.values(project.composition.assets)){
        const source=path.isAbsolute(asset.path)?asset.path:path.join(initial._assetDirectory||path.dirname(sourcePath),asset.path);
        asset.path=asset.id==='baseAsset'?path.relative(directory,videoPath).replace(/\\/g,'/'):path.relative(directory,await copyAsset(id,source)).replace(/\\/g,'/');
        delete asset.previewPath;delete asset.thumbnailPath;
      }
      require('../shared/composition-runtime.cjs').validateComposition(project.composition);
    }
    for(const message of project.chatMessages||[])for(const attachment of message.attachments||[]){
      const {attachmentPath}=require('./chat-attachments');
      const source=attachmentPath(initial._assetDirectory||path.dirname(sourcePath),attachment),target=attachmentPath(directory,attachment);
      if(path.resolve(source)!==path.resolve(target)){await fs.promises.mkdir(path.dirname(target),{recursive:true});await fs.promises.copyFile(source,target);}
    }
    writeProject(id, project);
    return project;
  }

  // Write the project before any video copying or analysis. Its source stays
  // readable while the background worker prepares managed clips.
  function createPending(sourcePaths, options = {}) {
    if (!Array.isArray(sourcePaths) || !sourcePaths.length || sourcePaths.some((file) =>
      typeof file !== 'string' || !fs.existsSync(file) || !fs.statSync(file).isFile())) {
      throw new Error('Select one or more existing video files');
    }
    const sources = sourcePaths.map((file) => path.resolve(file));
    const title = typeof options.title === 'string' && options.title.trim()
      ? options.title.trim() : path.basename(sources[0], path.extname(sources[0]));
    const id = options.managedId || newId(title);
    if(options.managedId&&!/^agent-[a-f0-9]{32}$/.test(id))throw new Error('Invalid managed import ID');
    if(options.managedId&&fs.existsSync(projectDir(id)))return open(id);
    fs.mkdirSync(projectDir(id));
    const now = new Date().toISOString();
    const project = {
      version: 1, id, title, videoPath: sources[0], sourceVideoPath: sources[0],
      clips: [{ id: randomUUID(), name: path.basename(sources[0]), path: sources[0],
        sourcePath: sources[0], start: 0, duration: 0 }],
      mediaFolders: options.mediaFolders||{ image: '', broll: '', music: '' }, studioSoundEnabled: false,
      aiSettings:options.aiSettings||{editingInstructions:'',mediaInstructions:'',customFillerWords:''},
      words: [], segments: [], deletedRanges: [], soundEvents: [], mediaItems: [],
      chatMessages: [], language: '', playhead: 0,
      processing: { status: 'queued', stage: 'Waiting to process', progress: 0,
        ...(options.defaultsRevision!==undefined?{defaultsRevision:options.defaultsRevision}:{}),
        sources, nextIndex: 0, preset: options.preset || 'personal',
        customMargin: Number.isFinite(options.customMargin) ? options.customMargin : 0.1,
        engine: options.engine || 'crisper', model: options.model || 'medium',
        language: options.language || 'ca',interpolate60:options.interpolate60!==false },
      createdAt: now, modifiedAt: now,
    };
    writeProject(id, project);
    return project;
  }

  function updateProcessing(id, patch) {
    const project = open(id);
    const allowed = ['status', 'stage', 'progress', 'nextIndex', 'error'];
    const update = Object.fromEntries(allowed.filter((key) => Object.hasOwn(patch || {}, key))
      .map((key) => [key, patch[key]]));
    const updated = { ...project, processing: { ...project.processing, ...update },
      modifiedAt: new Date().toISOString() };
    writeProject(id, updated);
    return updated.processing;
  }

  async function finishFirstClip(id, sourcePath) {
    const project = open(id);
    if (!project.processing || project.processing.nextIndex !== 0) {
      throw new Error('First clip has already been prepared');
    }
    const managed = await copyClipFile(id, sourcePath);
    const first = { ...project.clips[0], path: managed };
    const updated = { ...project, videoPath: managed, clips: [first],
      processing: { ...project.processing, nextIndex: 1 }, modifiedAt: new Date().toISOString() };
    writeProject(id, updated);
    return updated;
  }

  function save(id, snapshot) {
    const existing = open(id);
    if (!snapshot || !Array.isArray(snapshot.words) || !Array.isArray(snapshot.segments)
      || !Array.isArray(snapshot.deletedRanges) || !Array.isArray(snapshot.mediaItems)) {
      throw new Error('Invalid project state');
    }
    const updated = {
      ...existing,
      words: snapshot.words,
      segments: snapshot.segments,
      deletedRanges: snapshot.deletedRanges,
      soundEvents: Array.isArray(snapshot.soundEvents) ? snapshot.soundEvents : existing.soundEvents || [],
      mediaItems: snapshot.mediaItems,
      chatMessages: Array.isArray(snapshot.chatMessages) ? snapshot.chatMessages : existing.chatMessages || [],
      language: typeof snapshot.language === 'string' ? snapshot.language : existing.language,
      clips: Array.isArray(snapshot.clips) ? snapshot.clips : existing.clips || [],
      mediaFolders: snapshot.mediaFolders && typeof snapshot.mediaFolders === 'object'
        ? snapshot.mediaFolders : existing.mediaFolders || { image: '', broll: '', music: '' },
      studioSoundEnabled: typeof snapshot.studioSoundEnabled === 'boolean'
        ? snapshot.studioSoundEnabled : existing.studioSoundEnabled === true,
      playhead: Number.isFinite(snapshot.playhead) ? Math.max(0, snapshot.playhead) : existing.playhead,
      aiSettings: snapshot.aiSettings && typeof snapshot.aiSettings === 'object'
        ? snapshot.aiSettings : existing.aiSettings,
      modifiedAt: new Date().toISOString(),
    };
    writeProject(id, updated);
    return { id, modifiedAt: updated.modifiedAt };
  }

  function rename(id, title) {
    const clean = typeof title === 'string' ? title.trim() : '';
    if (!clean || clean.length > 120 || /[\r\n]/.test(clean)) throw new Error('Enter a project name up to 120 characters');
    const project = open(id);
    const updated = { ...project, title: clean, modifiedAt: new Date().toISOString() };
    writeProject(id, updated);
    return updated;
  }

  async function duplicate(id) {
    const sourceDir = checkManagedDirectory(id);
    const existing = open(id);
    const title = `${existing.title} (copy)`;
    const duplicateId = newId(title);
    const destination = projectDir(duplicateId);
    try {
      await fs.promises.cp(sourceDir, destination, { recursive: true, force: false, errorOnExist: true,
        filter: (entry) => path.basename(entry)!=='.cache'&&!path.basename(entry).endsWith('.partial')&&!/\.(?:edity|cutscript)-preview\./i.test(path.basename(entry)) });
      const withinSource = (file) => {
        const relative = path.relative(sourceDir, path.resolve(file));
        return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : null;
      };
      const videoRelative = withinSource(existing.videoPath)||path.relative(destination,await copyAsset(duplicateId,existing.videoPath));
      const mediaItems = [];
      for (const item of existing.mediaItems || []) {
        const relative = withinSource(item.path);
        mediaItems.push({ ...item, path: relative
          ? path.join(destination, relative) : await copyAsset(duplicateId, item.path) });
      }
      const clips = await Promise.all((existing.clips || []).map(async(clip) => {
        const relative = withinSource(clip.path);
        return { ...clip, path: relative?path.join(destination, relative):await copyAsset(duplicateId,clip.path) };
      }));
      const now = new Date().toISOString();
      const result = { ...existing, id: duplicateId, title,
        videoPath: path.join(destination, videoRelative), clips, mediaItems, createdAt: now, modifiedAt: now };
      if(result.processing&&result.processing.status!=='done')result.processing={...result.processing,status:'queued',sources:await Promise.all(result.processing.sources.map(async file=>withinSource(file)?path.join(destination,withinSource(file)):await copyAsset(duplicateId,file)))};
      if(result.composition){
        result.composition=structuredClone(result.composition);
        for(const asset of Object.values(result.composition.assets))if(path.isAbsolute(asset.path)){const relative=withinSource(asset.path);if(relative)asset.path=relative.replace(/\\/g,'/');else if(asset.id==='baseAsset')asset.path=videoRelative.replace(/\\/g,'/');else asset.path=path.relative(destination,await copyAsset(duplicateId,asset.path)).replace(/\\/g,'/');}
        const journal=path.join(destination,'history.jsonl');
        if(fs.existsSync(journal)){
          const remap=value=>typeof value==='string'&&value.startsWith(sourceDir+path.sep)?path.join(destination,path.relative(sourceDir,value)):Array.isArray(value)?value.map(remap):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,val])=>[key,remap(val)])):value;
          fs.writeFileSync(journal,fs.readFileSync(journal,'utf8').split('\n').filter(Boolean).map(line=>JSON.stringify(remap(JSON.parse(line)))).join('\n')+'\n');
        }
      }
      writeProject(duplicateId, result);
      return result;
    } catch (error) {
      if (fs.existsSync(destination)) {
        checkManagedDirectory(duplicateId);
        await fs.promises.rm(destination, { recursive: true, force: true });
      }
      throw error;
    }
  }

  async function exportProject(id, destination) {
    checkManagedDirectory(id);
    const output = path.resolve(destination);
    const parent = fs.realpathSync(path.dirname(output));
    const relative = path.relative(fs.realpathSync(root), parent);
    if (!relative || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
      throw new Error('Export outside the project library so the archive survives project deletion');
    }
    if (fs.existsSync(output)) {
      const targetRelative = path.relative(fs.realpathSync(root), fs.realpathSync(output));
      if (!targetRelative || (!targetRelative.startsWith('..') && !path.isAbsolute(targetRelative))) {
        throw new Error('Choose a file outside the project library');
      }
    }
    const { editingInstructions: _legacyInstructions, ...project } = open(id);
    return writeProjectArchive(output, project,projectDir(id));
  }

  async function importProject(source) {
    const file = path.resolve(source);
    if (!isZipArchive(file)) {
      const legacy = JSON.parse(await fs.promises.readFile(file, 'utf8'));
      if (![1,2].includes(legacy.version) || !Array.isArray(legacy.words)) throw new Error('Invalid project file');
      const videoPath = [legacy.videoPath, legacy.sourceVideoPath].find((candidate) =>
        typeof candidate === 'string' && fs.existsSync(candidate));
      if (!videoPath) throw new Error('The video referenced by this project is missing');
      return create(videoPath, {...legacy,_assetDirectory:path.dirname(file)});
    }
    const stagingId = `.import-${randomUUID()}`;
    const staging = path.join(root, stagingId);
    await fs.promises.mkdir(staging);
    let destination = null;
    try {
      const data = await extractProjectArchive(file, staging);
      const title = typeof data.title === 'string' && data.title.trim() ? data.title.trim() : 'Imported project';
      const id = newId(title);
      destination = projectDir(id);
      await fs.promises.rename(staging, destination);
      const now = new Date().toISOString();
      const project = { ...data, id, title,
        videoPath: path.join(destination, ...archiveName(data.videoPath).split('/')),
        clips: (data.clips || []).map((clip) => ({ ...clip,
          path: path.join(destination, ...archiveName(clip.path).split('/')) })),
        mediaItems: (data.mediaItems || []).map((item) => ({ ...item,
          path: path.join(destination, ...archiveName(item.path).split('/')) })),
        createdAt: now, modifiedAt: now };
      if(project.processing&&project.processing.status!=='done')project.processing={...project.processing,status:'queued',sources:project.processing.sources.map(file=>path.join(destination,...archiveName(file).split('/')))};
      writeProject(id, project);
      return project;
    } catch (error) {
      for (const directory of [staging, destination]) {
        if (!directory || !fs.existsSync(directory)) continue;
        const relative = path.relative(path.resolve(root), path.resolve(directory));
        if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) continue;
        await fs.promises.rm(directory, { recursive: true, force: true });
      }
      throw error;
    }
  }

  async function remove(id, trashItem) {
    const directory = checkManagedDirectory(id);
    open(id);
    if (typeof trashItem !== 'function') throw new Error('Project deletion is unavailable');
    // Moving the whole directory to Trash leaves the project intact if the OS
    // still has its video open. Recursive removal can erase project metadata
    // before it reaches the locked video, making a failed deletion unrecoverable.
    setPending(id, true);
    for (let attempt = 0; ; attempt++) {
      try {
        await trashItem(directory);
        setPending(id, false);
        break;
      } catch (error) {
        // Electron's shell.trashItem may wrap EBUSY without preserving its code.
        if (!fs.existsSync(directory)) {
          setPending(id, false);
          break;
        }
        if (!isBusyError(error)) {
          setPending(id, false);
          throw error;
        }
        if (attempt >= 20) return { pending: true };
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    return { pending: false };
  }

  async function cleanupPending(trashItem) {
    if (typeof trashItem !== 'function') return;
    const ids = readPending();
    const completed = new Set();
    for (const id of [...ids]) {
      const directory = projectDir(id);
      if (!fs.existsSync(directory)) {
        completed.add(id);
        continue;
      }
      try {
        await trashItem(directory);
        completed.add(id);
      } catch (error) {
        if (!isBusyError(error)) console.warn(`Could not finish deleting project ${id}:`, error);
      }
    }
    const current = readPending();
    for (const id of completed) current.delete(id);
    writePending(current);
  }

  function deferDeletion(id) {
    projectDir(id);
    setPending(id, true);
  }

  function list() {
    const pending = readPending();
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !pending.has(entry.name))
      .flatMap((entry) => {
        try {
          const data = open(entry.name);
          return [{
            id: data.id || entry.name,
            title: data.title || path.basename(data.videoPath),
            videoPath: data.videoPath,
            sourceVideoPath: data.sourceVideoPath,
            createdAt: data.createdAt,
            modifiedAt: data.modifiedAt,
            missingVideo: !fs.existsSync(data.videoPath),
            processing: data.processing,
          }];
        } catch {
          return [];
        }
      })
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  }

  return { root, create, createPending, updateProcessing, finishFirstClip, open, save, list, copyAsset, addClip, removeClip,
    setCommitHandler(handler){commitHandler=handler;},
    rename, duplicate, exportProject, importProject, remove, cleanupPending, deferDeletion };
}

module.exports = { createProjectStore };
