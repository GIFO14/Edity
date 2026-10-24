"""Explicit optional ducking, steady manual music over delivered v28."""
from pathlib import Path
import shutil
repo=Path(__file__).resolve().parents[1]
base=repo/'dist/staging/timeline-drop-v28';stage=repo/'dist/staging/music-fidelity-v29'
for folder in ['app','frontend','shared']:
    shutil.copytree(base/folder,stage/folder,dirs_exist_ok=True,ignore=shutil.ignore_patterns('node_modules','.git') if folder=='frontend' else None)
for name in ['composition/droppedMedia.ts','components/ElementInspector.tsx','components/MediaPanel.tsx']:
    shutil.copy2(repo/'frontend/src'/name,stage/'frontend/src'/name)
for name in ['media-capabilities.js','python-bridge.js','packaged-verification.js','music-fidelity-verification.js']:
    shutil.copy2(repo/'electron'/name,stage/'app/electron'/name)
for name in ['main.py','services/media_actions.py']:
    shutil.copy2(repo/'backend'/name,stage/'app/backend'/name)
for name in ['electron/media-worker.js','backend/services/composition_audio.py','shared/composition-runtime.cjs']:
    assert (stage/'app'/name).read_bytes()==(base/'app'/name).read_bytes()
print(stage)
