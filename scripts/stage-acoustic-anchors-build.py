"""Scoped acoustic visual timing build over the delivered playback-cuts-v20."""
from pathlib import Path
import shutil

repo = Path(__file__).resolve().parents[1]
base = repo/'dist/staging/playback-cuts-v20'
stage = repo/'dist/staging/acoustic-anchors-v21'
for folder in ['app', 'frontend', 'shared']:
    shutil.copytree(base/folder, stage/folder, dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns('node_modules', '.git') if folder == 'frontend' else None)
for name in ['composition/types.ts', 'composition/timeMap.ts', 'composition/validation.ts',
             'composition/manifestClient.ts', 'components/CompositionPlayer.tsx', 'store/compositionStore.ts']:
    shutil.copy2(repo/'frontend/src'/name, stage/'frontend/src'/name)
for name in ['manifest-request.js', 'media-capabilities.js', 'external-agent-tools.js', 'python-bridge.js', 'packaged-verification.js','acoustic-anchors-verification.js']:
    shutil.copy2(repo/'electron'/name, stage/'app/electron'/name)
for name in ['main.py', 'routers/preview.py', 'services/cut_manifest.py', 'services/composition_models.py',
             'services/project_models.py', 'services/media_actions.py', 'services/visual_word_timing.py']:
    shutil.copy2(repo/'backend'/name, stage/'app/backend'/name)
assert (stage/'app/electron/media-worker.js').read_bytes() == (base/'app/electron/media-worker.js').read_bytes()
print(stage)
