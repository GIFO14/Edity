"""Timeline maximize / restore over delivered media-inspector-v35."""
from pathlib import Path
import shutil
repo=Path(__file__).resolve().parents[1]
base=repo/'dist/staging/media-inspector-v35';stage=repo/'dist/staging/timeline-width-v36'
for folder in ['app','frontend','shared']:
    shutil.copytree(base/folder,stage/folder,dirs_exist_ok=True,ignore=shutil.ignore_patterns('node_modules','.git') if folder=='frontend' else None)
for name in ['App.tsx','store/compositionStore.ts','components/VideoPlayer.tsx','components/CompositionTimeline.tsx','components/TimelineWorkspace.css']:
    shutil.copy2(repo/'frontend/src'/name,stage/'frontend/src'/name)
for name in ['packaged-verification.js','timeline-width-verification.js']:
    shutil.copy2(repo/'electron'/name,stage/'app/electron'/name)
for name in ['electron/media-worker.js','shared/composition-runtime.cjs','backend/services/composition_audio.py','electron/external-agent-tools.js']:
    assert (stage/'app'/name).read_bytes()==(base/'app'/name).read_bytes(),name
assert (stage/'frontend/src/components/CompositionPlayer.tsx').read_bytes()==(base/'frontend/src/components/CompositionPlayer.tsx').read_bytes()
print(stage)
