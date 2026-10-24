"""Timeline wheel shortcuts over the verified acoustic-anchors-v21 build."""
from pathlib import Path
import shutil
repo=Path(__file__).resolve().parents[1]
base=repo/'dist/staging/acoustic-anchors-v21'
stage=repo/'dist/staging/timeline-wheel-v22'
for folder in ['app','frontend','shared']:
    shutil.copytree(base/folder,stage/folder,dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns('node_modules','.git') if folder=='frontend' else None)
shutil.copy2(repo/'frontend/src/components/CompositionTimeline.tsx',stage/'frontend/src/components/CompositionTimeline.tsx')
for name in ['packaged-verification.js','timeline-wheel-verification.js']:
    shutil.copy2(repo/'electron'/name,stage/'app/electron'/name)
print(stage)
