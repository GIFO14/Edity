"""Scoped 1000x timeline, quiet join cleanup and project history over v24."""
from pathlib import Path
import shutil
repo=Path(__file__).resolve().parents[1]
base=repo/'dist/staging/base-cuts-v24';stage=repo/'dist/staging/quiet-joins-v25'
for folder in ['app','frontend','shared']:
    shutil.copytree(base/folder,stage/folder,dirs_exist_ok=True,
        ignore=shutil.ignore_patterns('node_modules','.git') if folder=='frontend' else None)
for name in ['components/CompositionTimeline.tsx','components/TranscriptEditor.tsx',
             'hooks/useKeyboardShortcuts.ts','lib/projectPersistence.ts']:
    shutil.copy2(repo/'frontend/src'/name,stage/'frontend/src'/name)
for name in ['base-cuts-verification.js','timeline-wheel-verification.js','python-bridge.js']:
    shutil.copy2(repo/'electron'/name,stage/'app/electron'/name)
for name in ['services/adjacent_cuts.py','services/cut_manifest.py']:
    shutil.copy2(repo/'backend'/name,stage/'app/backend'/name)
p=stage/'app/backend/main.py'
p.write_text(p.read_text(encoding='utf8').replace('workflowVersion":21','workflowVersion":22'),encoding='utf8')
assert (stage/'app/electron/media-worker.js').read_bytes()==(base/'app/electron/media-worker.js').read_bytes()
assert (stage/'app/shared/composition-runtime.cjs').read_bytes()==(base/'app/shared/composition-runtime.cjs').read_bytes()
print(stage)
