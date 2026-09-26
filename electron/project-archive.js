const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const archiver = require('archiver');
const yauzl = require('yauzl');

function archiveName(name) {
  if (typeof name !== 'string' || !/^(?:video|media|clips)\/[a-zA-Z0-9._-]+$/.test(name)
    || name.split('/')[1].startsWith('.')) {
    throw new Error('Invalid project archive entry');
  }
  return name;
}

async function writeProjectArchive(destination, project) {
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
  const manifest = { bundleVersion: 1, project: { ...project, id: undefined,
    sourceVideoPath: undefined, videoPath: videoName, clips, mediaItems } };
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
    if (manifest.bundleVersion !== 1 || !manifest.project || manifest.project.version !== 1) {
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
