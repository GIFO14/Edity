const fs = require('node:fs');
const path = require('node:path');
const { randomUUID,createHash } = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const archiver = require('archiver');
const yauzl = require('yauzl');

function archiveName(name) {
  if (typeof name !== 'string' || !/^(?:video|media|clips|assets|fonts|attachments)\/[a-zA-Z0-9._-]+$/.test(name)
    || name.split('/')[1].startsWith('.')) {
    throw new Error('Invalid project archive entry');
  }
  return name;
}

async function writeProjectArchive(destination, project, projectDirectory = path.dirname(project.videoPath)) {
  const output = path.resolve(destination);
  const video = path.resolve(project.videoPath);
  if (!fs.statSync(video).isFile()) throw new Error('Project video is missing');
  const videoName = archiveName(`video/video${path.extname(video).toLowerCase()}`);
  const files = [{ source: video, name: videoName }];
  const clips = [];
  for (const [index, clip] of (project.clips || []).entries()) {
    const source = path.resolve(clip.path);
    if (!fs.statSync(source).isFile()) throw new Error(`Project clip is missing: ${clip.path}`);
    const name = archiveName(`clips/${index}${path.extname(source).toLowerCase()}`);
    files.push({ source, name });
    clips.push({ ...clip, sourcePath: undefined, path: name });
  }
  const mediaItems = [];
  for (const [index, item] of (project.mediaItems || []).entries()) {
    const source = path.resolve(item.path);
    if (!fs.statSync(source).isFile()) throw new Error(`Project media is missing: ${item.path}`);
    const name = archiveName(`media/${index}${path.extname(source).toLowerCase()}`);
    files.push({ source, name });
    mediaItems.push({ ...item, path: name });
  }
  const chatMessages=structuredClone(project.chatMessages||[]);
  for(const message of chatMessages)for(const attachment of message.attachments||[]){
    const source=require('./chat-attachments').attachmentPath(projectDirectory,attachment);
    if(!fs.existsSync(source)||!fs.statSync(source).isFile())throw new Error(`Chat attachment is missing: ${attachment.name}`);
    const name=archiveName(attachment.path);if(!files.some(file=>file.name===name))files.push({source,name});
  }
  let composition=project.composition?structuredClone(project.composition):undefined;
  if(composition)for(const asset of Object.values(composition.assets)){
    const source=path.isAbsolute(asset.path)?asset.path:path.join(projectDirectory,asset.path);
    if(!fs.existsSync(source)||!fs.statSync(source).isFile())throw new Error(`Project asset is missing: ${asset.name}`);
    const name=path.resolve(source)===video?videoName:archiveName(`${asset.kind==='font'?'fonts':'assets'}/${createHash('sha256').update(asset.id).digest('hex')}${path.extname(source).toLowerCase()}`);
    if(!files.some(file=>file.name===name))files.push({source,name});
    asset.path=name;delete asset.normalizedPath;delete asset.previewPath;delete asset.thumbnailPath;
  }
  let processing=project.processing?structuredClone(project.processing):undefined;
  if(processing&&processing.status!=='done'){processing.sources=processing.sources.map((source,index)=>{if(!fs.existsSync(source))throw new Error(`Pending recording is missing: ${source}`);const name=archiveName(`assets/pending-source-${index}${path.extname(source).toLowerCase()}`);files.push({source,name});return name;});processing.status='queued';}
  const manifest = { bundleVersion: project.version===2?2:1, project: { ...project, id: undefined,
    sourceVideoPath: undefined, videoPath: videoName, clips, mediaItems,composition,processing,chatMessages } };
  const temporary = `${output}.${randomUUID()}.tmp`;
  try {
    await new Promise((resolve, reject) => {
      const stream = fs.createWriteStream(temporary, { flags: 'wx' });
      const zip = archiver('zip', { store: true });
      stream.on('close', resolve);
      stream.on('error', reject);
      zip.on('error', reject);
      zip.pipe(stream);
      zip.append(JSON.stringify(manifest), { name: 'manifest.json' });
      for (const file of files) zip.file(file.source, { name: file.name });
      zip.finalize().catch(reject);
    });
    await fs.promises.copyFile(temporary, output);
    return output;
  } finally {
    await fs.promises.rm(temporary, { force: true });
  }
}

function openZip(file) {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, autoClose: true }, (error, zip) =>
      error ? reject(error) : resolve(zip));
  });
}

async function extractProjectArchive(source, destination) {
  const zip = await openZip(source);
  const names = new Set();
  let count = 0;
  try {
    await new Promise((resolve, reject) => {
      let failed = false;
      const fail = (error) => {
        if (failed) return;
        failed = true;
        zip.close();
        reject(error);
      };
      zip.on('error', fail);
      zip.on('end', resolve);
      zip.on('entry', async (entry) => {
        try {
          count += 1;
          if (count > 1000 || names.has(entry.fileName)) throw new Error('Invalid project archive');
          names.add(entry.fileName);
          if (entry.fileName !== 'manifest.json') archiveName(entry.fileName);
          if (entry.fileName === 'manifest.json' && entry.uncompressedSize > 10_000_000) {
            throw new Error('Project manifest is too large');
          }
          const target = path.join(destination, ...entry.fileName.split('/'));
          await fs.promises.mkdir(path.dirname(target), { recursive: true });
          const input = await new Promise((resolveStream, rejectStream) =>
            zip.openReadStream(entry, (error, stream) => error ? rejectStream(error) : resolveStream(stream)));
          await pipeline(input, fs.createWriteStream(target, { flags: 'wx' }));
          zip.readEntry();
        } catch (error) {
          fail(error);
        }
      });
      zip.readEntry();
    });
    if (!names.has('manifest.json')) throw new Error('Project manifest is missing');
    const manifest = JSON.parse(await fs.promises.readFile(path.join(destination, 'manifest.json'), 'utf8'));
    if (![1,2].includes(manifest.bundleVersion) || !manifest.project || ![1,2].includes(manifest.project.version)) {
      throw new Error('Unsupported project archive');
    }
    const project = manifest.project;
    const videoName = archiveName(project.videoPath);
    if (!videoName.startsWith('video/') || !names.has(videoName)) throw new Error('Project video is missing');
    for (const item of project.mediaItems || []) {
      const name = archiveName(item.path);
      if (!name.startsWith('media/') || !names.has(name)) throw new Error('Project media is missing');
    }
    for (const clip of project.clips || []) {
      const name = archiveName(clip.path);
      if (!name.startsWith('clips/') || !names.has(name)) throw new Error('Project clip is missing');
    }
    if(project.processing&&project.processing.status!=='done')for(const source of project.processing.sources||[]){const name=archiveName(source);if(!names.has(name))throw new Error('Pending source is missing');}
    for(const message of project.chatMessages||[])for(const attachment of message.attachments||[]){
      require('./chat-attachments').attachmentPath(destination,attachment);
      if(!names.has(attachment.path))throw new Error(`Chat attachment is missing: ${attachment.name}`);
    }
    if(project.version===2){
      require('../shared/composition-runtime.cjs').validateComposition(project.composition);
      for(const asset of Object.values(project.composition.assets)){const name=archiveName(asset.path);if(!names.has(name))throw new Error(`Project asset is missing: ${asset.name}`);}
    }
    return project;
  } finally {
    zip.close();
  }
}

function isZipArchive(file) {
  const descriptor = fs.openSync(file, 'r');
  try {
    const header = Buffer.alloc(4);
    fs.readSync(descriptor, header, 0, 4, 0);
    return header.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  } finally {
    fs.closeSync(descriptor);
  }
}

module.exports = { writeProjectArchive, extractProjectArchive, isZipArchive, archiveName };
