"""Direct text editing in the viewer over verified color-presets-v33."""
from pathlib import Path
import shutil
repo=Path(__file__).resolve().parents[1]
base=repo/'dist/staging/color-presets-v33';stage=repo/'dist/staging/viewer-text-v34'
for folder in ['app','frontend','shared']:
    shutil.copytree(base/folder,stage/folder,dirs_exist_ok=True,ignore=shutil.ignore_patterns('node_modules','.git') if folder=='frontend' else None)
for name in ['ViewerManipulationLayer.tsx','ViewerTextEditor.tsx']:
    shutil.copy2(repo/'frontend/src/components'/name,stage/'frontend/src/components'/name)
for name in ['packaged-verification.js','viewer-text-verification.js']:
    shutil.copy2(repo/'electron'/name,stage/'app/electron'/name)
for name in ['electron/media-worker.js','shared/composition-runtime.cjs','backend/services/composition_audio.py']:
    assert (stage/'app'/name).read_bytes()==(base/'app'/name).read_bytes(),name
print(stage)
