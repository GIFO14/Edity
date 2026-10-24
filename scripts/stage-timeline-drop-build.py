"""Add direct local media drops/import actions over delivered color-grading-v27."""
from pathlib import Path
import shutil
repo=Path(__file__).resolve().parents[1]
base=repo/'dist/staging/color-grading-v27';stage=repo/'dist/staging/timeline-drop-v28'
for folder in ['app','frontend','shared']:
    shutil.copytree(base/folder,stage/folder,dirs_exist_ok=True,
        ignore=shutil.ignore_patterns('node_modules','.git') if folder=='frontend' else None)
for name in ['components/CompositionTimeline.tsx','composition/droppedMedia.ts','lib/dropTimelineMedia.ts']:
    destination=stage/'frontend/src'/name;destination.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(repo/'frontend/src'/name,destination)
for name in ['asset-library.js','media-action-dispatcher.js','external-agent-tools.js','media-capabilities.js','python-bridge.js','packaged-verification.js','timeline-drop-verification.js']:
    shutil.copy2(repo/'electron'/name,stage/'app/electron'/name)
shutil.copy2(repo/'backend/services/media_actions.py',stage/'app/backend/services/media_actions.py')
# Importing media can overlap an audio mix cache rename.
shutil.copy2(repo/'backend/services/asset_preparation.py',stage/'app/backend/services/asset_preparation.py')
shutil.copy2(repo/'backend/main.py',stage/'app/backend/main.py')
for name in ['media-files.json','media-action-schema.json']:
    for folder in ['shared','app/shared']:shutil.copy2(repo/'shared'/name,stage/folder/name)
for name in ['electron/media-worker.js','shared/composition-runtime.cjs']:
    assert (stage/'app'/name).read_bytes()==(base/'app'/name).read_bytes()
print(stage)
