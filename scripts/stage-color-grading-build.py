"""Scoped source-domain grading, real bridge and shared compositor over v26."""
from pathlib import Path
import shutil,sys,json
repo=Path(__file__).resolve().parents[1]
base=repo/'dist/staging/timeline-trim-v26';stage=repo/'dist/staging/color-grading-v27'
for folder in ['app','frontend','shared']:
    shutil.copytree(base/folder,stage/folder,dirs_exist_ok=True,
        ignore=shutil.ignore_patterns('node_modules','.git') if folder=='frontend' else None)
for name in ['composition/types.ts','composition/compiler.ts','composition/operations.ts','composition/validation.ts','composition/projectValidation.ts','composition/runtime.ts','composition/colorGrade.ts','components/ColorGradingControls.tsx','components/ExportDialog.tsx','components/ElementInspector.tsx','components/CompositionPlayer.tsx','store/compositionStore.ts','render/compositor.ts','render/frameProvider.ts','render-worker/main.ts']:
    shutil.copy2(repo/'frontend/src'/name,stage/'frontend/src'/name)
# Keep the delivered transition shader; its separate root revision is unrelated.
p=stage/'frontend/src/render/compositor.ts';s=p.read_text(encoding='utf8');original=(base/'frontend/src/render/compositor.ts').read_text(encoding='utf8');a='const transitionFragment=';b='function shader(';s=s[:s.index(a)]+original[original.index(a):original.index(b)]+s[s.index(b):];p.write_text(s,encoding='utf8')
for name in ['composition_models.py','project_models.py','media_actions.py','asset_preparation.py','color_pipeline.py']:
    shutil.copy2(repo/'backend/services'/name,stage/'app/backend/services'/name)
shutil.copy2(repo/'backend/routers/composition.py',stage/'app/backend/routers/composition.py')
for name in ['media-worker.js','decoder-input.js','source-frame-time.js','media-capabilities.js','project-repository.js','python-bridge.js','packaged-verification.js','color-grading-verification.js']:
    shutil.copy2(repo/'electron'/name,stage/'app/electron'/name)
# Preserve the previous ungraded sampling behaviour; the root also contains a
# separate, unshipped source-FPS correction. Graded sources require their real
# source grid to agree with managed preview and inspection.
p=stage/'app/electron/media-worker.js';s=p.read_text(encoding='utf8').replace('this.fps = sourceFrameRate(asset,fps);','this.fps = managed?sourceFrameRate(asset,fps):fps;').replace("const frame = this.asset.kind==='image'?0:sourceFrameIndex(timeUs,this.fps);", "const frame = this.asset.kind==='image'?0:this.managed?sourceFrameIndex(timeUs,this.fps):Math.floor(timeUs/1e6*this.fps);");p.write_text(s,encoding='utf8')
p=stage/'app/backend/main.py';p.write_text(p.read_text(encoding='utf8').replace('workflowVersion":22','workflowVersion":23'),encoding='utf8')
for name in ['composition','audio-plan','media-action','operation','project-v2','cut-manifest','transaction']:
    for folder in ['shared','app/shared']:shutil.copy2(repo/'shared'/f'{name}-schema.json',stage/folder/f'{name}-schema.json')
for folder in ['shared','app/shared']:shutil.copy2(repo/'shared/color-decode.cjs',stage/folder/'color-decode.cjs')
print(stage)
