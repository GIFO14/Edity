"""Stable native timeline trimming over the delivered quiet-joins-v25."""
from pathlib import Path
import shutil
repo=Path(__file__).resolve().parents[1]
base=repo/'dist/staging/quiet-joins-v25';stage=repo/'dist/staging/timeline-trim-v26'
for folder in ['app','frontend','shared']:
    shutil.copytree(base/folder,stage/folder,dirs_exist_ok=True,
        ignore=shutil.ignore_patterns('node_modules','.git') if folder=='frontend' else None)
for name in ['components/CompositionTimeline.tsx','composition/timelineDrag.ts']:
    shutil.copy2(repo/'frontend/src'/name,stage/'frontend/src'/name)
for name in ['timeline-trim-verification.js','packaged-verification.js']:
    shutil.copy2(repo/'electron'/name,stage/'app/electron'/name)
for name in ['electron/media-worker.js','shared/composition-runtime.cjs']:
    assert (stage/'app'/name).read_bytes()==(base/'app'/name).read_bytes()
print(stage)
