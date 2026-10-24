"""Resolve-like fade display over v30; audio/gesture contracts preserved."""
from pathlib import Path
import shutil
repo=Path(__file__).resolve().parents[1]
base=repo/'dist/staging/timeline-workspace-v30';stage=repo/'dist/staging/fade-appearance-v31'
for folder in ['app','frontend','shared']:
    shutil.copytree(base/folder,stage/folder,dirs_exist_ok=True,ignore=shutil.ignore_patterns('node_modules','.git') if folder=='frontend' else None)
for name in ['components/CompositionTimeline.tsx','composition/timelineLayout.ts']:
    shutil.copy2(repo/'frontend/src'/name,stage/'frontend/src'/name)
shutil.copy2(repo/'electron/timeline-workspace-verification.js',stage/'app/electron/timeline-workspace-verification.js')
for name in ['electron/media-worker.js','shared/composition-runtime.cjs','backend/services/composition_audio.py']:
    assert (stage/'app'/name).read_bytes()==(base/'app'/name).read_bytes()
print(stage)
