// Backend-only overlay: preserve every delivered v49 renderer/codec dependency.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const asar = require('@electron/asar');
const root = path.resolve(__dirname, '..');
const base = path.join(root, 'dist/app/interpolation-gpu-v49/win-unpacked');
const stage = path.join(root, 'dist/staging/word-cut-recovery-v50/app');
const output = path.join(root, 'dist/app/word-cut-recovery-v50/win-unpacked');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const overlays = ['backend/main.py', 'backend/job_worker.py', 'electron/python-bridge.js', 'electron/processing-jobs.js',
  ...['speech_cut_alignment', 'cut_refinement', 'cut_manifest', 'visual_word_timing'].map(x => `backend/services/${x}.py`),
  'backend/requirements-windows-transcription.txt', 'backend/constraints-windows-transcription.txt'];
async function main() {
  if (hash(path.join(base, 'resources/app.asar')) !== '30669f7f6ef078cc50564308cf1081b141072a12a25fed905ad072132509a48f') throw Error('Unexpected v49 baseline');
  if (!process.argv.includes('--refresh')) {
    if (fs.existsSync(stage) || fs.existsSync(output)) throw Error('Choose fresh staging/output paths');
    fs.mkdirSync(stage, {recursive:true});
    asar.extractAll(path.join(base, 'resources/app.asar'), stage);
    fs.cpSync(base, output, {recursive:true, filter: p => path.basename(p) !== 'app.asar'});
  }
  for (const name of overlays) {
    fs.copyFileSync(path.join(root, name), path.join(stage, name));
    if (name.startsWith('backend/')) fs.copyFileSync(path.join(root, name), path.join(output, 'resources', name));
  }
  await asar.createPackage(stage, path.join(output, 'resources/app.asar'));
  for (const file of ['shared/render-compositor.cjs','frontend/dist/assets/compositor-CIYrAvbA.js']) {
    const original = asar.extractFile(path.join(base, 'resources/app.asar'), path.normalize(file));
    if (!original.equals(fs.readFileSync(path.join(stage, file)))) throw Error('Renderer changed: '+file);
  }
  console.log(JSON.stringify({output,archiveSha256:hash(path.join(output,'resources/app.asar')),overlays,rendererUnchanged:true}));
}
main().catch(error => {console.error(error);process.exitCode=1;});
