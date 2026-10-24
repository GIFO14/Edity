"""Scoped timeline gain and razor tools over verified fade-appearance-v31."""
from pathlib import Path
import shutil
repo=Path(__file__).resolve().parents[1]
base=repo/'dist/staging/fade-appearance-v31';stage=repo/'dist/staging/timeline-editing-v32'
for folder in ['app','frontend','shared']:
    shutil.copytree(base/folder,stage/folder,dirs_exist_ok=True,ignore=shutil.ignore_patterns('node_modules','.git') if folder=='frontend' else None)
for name in ['components/CompositionTimeline.tsx','components/ElementInspector.tsx','composition/timelineEditing.ts','composition/timelineDrag.ts','composition/types.ts','composition/compiler.ts','composition/timeMap.ts','composition/validation.ts','composition/narration.ts','lib/projectPersistence.ts','hooks/useKeyboardShortcuts.ts']:
    shutil.copy2(repo/'frontend/src'/name,stage/'frontend/src'/name)
for name in ['services/composition_models.py','services/composition_audio.py']:
    shutil.copy2(repo/'backend'/name,stage/'app/backend'/name)
for name in ['composition','audio-plan','media-action','operation','project-v2','cut-manifest','transaction']:
    for dest in [stage/'shared',stage/'app/shared']:
        shutil.copy2(repo/'shared'/f'{name}-schema.json',dest/f'{name}-schema.json')
for name in ['edit-boundaries.mjs','edit-boundaries.d.mts']:
    for dest in [stage/'shared',stage/'app/shared']:
        shutil.copy2(repo/'shared'/name,dest/name)
shutil.copy2(repo/'electron/timeline-workspace-verification.js',stage/'app/electron/timeline-workspace-verification.js')
shutil.copy2(repo/'electron/resolve-export.js',stage/'app/electron/resolve-export.js')
# Make older backend instances ineligible to answer the new envelope contract.
p=stage/'app/backend/main.py';p.write_text(p.read_text(encoding='utf8').replace('workflowVersion":26','workflowVersion":27'),encoding='utf8')
p=stage/'app/electron/python-bridge.js';p.write_text(p.read_text(encoding='utf8').replace('workflowVersion===26','workflowVersion===27'),encoding='utf8')
assert (stage/'app/electron/media-worker.js').read_bytes()==(base/'app/electron/media-worker.js').read_bytes()
print(stage)
