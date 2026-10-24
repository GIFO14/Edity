"""Scoped Media inspector UI over the delivered viewer-text-v34 build."""
from pathlib import Path
import shutil
repo=Path(__file__).resolve().parents[1]
base=repo/'dist/staging/viewer-text-v34';stage=repo/'dist/staging/media-inspector-v35'
for folder in ['app','frontend','shared']:
    shutil.copytree(base/folder,stage/folder,dirs_exist_ok=True,ignore=shutil.ignore_patterns('node_modules','.git') if folder=='frontend' else None)
for name in ['MediaPanel.tsx','ElementInspector.tsx','ColorGradingControls.tsx','InspectorSection.tsx','MediaInspector.css','CompositionTimeline.tsx']:
    shutil.copy2(repo/'frontend/src/components'/name,stage/'frontend/src/components'/name)
for name in ['packaged-verification.js','media-inspector-verification.js']:
    shutil.copy2(repo/'electron'/name,stage/'app/electron'/name)
for name in ['electron/media-worker.js','shared/composition-runtime.cjs','backend/services/composition_audio.py']:
    assert (stage/'app'/name).read_bytes()==(base/'app'/name).read_bytes(),name
assert (stage/'frontend/src/components/CompositionPlayer.tsx').read_bytes()==(base/'frontend/src/components/CompositionPlayer.tsx').read_bytes()
print(stage)
