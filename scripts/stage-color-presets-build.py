"""Reusable manual/sidebar/CLI color presets over verified timeline-editing-v32."""
from pathlib import Path
import shutil
repo=Path(__file__).resolve().parents[1]
base=repo/'dist/staging/timeline-editing-v32';stage=repo/'dist/staging/color-presets-v33'
for folder in ['app','frontend','shared']:
    shutil.copytree(base/folder,stage/folder,dirs_exist_ok=True,ignore=shutil.ignore_patterns('node_modules','.git') if folder=='frontend' else None)
for name in ['components/ColorGradingControls.tsx','composition/types.ts','vite-env.d.ts']:
    shutil.copy2(repo/'frontend/src'/name,stage/'frontend/src'/name)
for name in ['editing-library.js','color-grade-presets.js','external-agent-tools.js','media-capabilities.js','media-action-dispatcher.js','preload.js','packaged-verification.js','color-presets-verification.js']:
    shutil.copy2(repo/'electron'/name,stage/'app/electron'/name)
shutil.copy2(repo/'backend/services/media_actions.py',stage/'app/backend/services/media_actions.py')
for dest in [stage/'shared',stage/'app/shared']:
    shutil.copy2(repo/'shared/media-action-schema.json',dest/'media-action-schema.json')
p=stage/'app/electron/main.js';s=p.read_text(encoding='utf8');line="  editingLibrary=new EditingLibrary(app.getPath('userData'));";assert line in s
s=s.replace(line,line+"\n  editingLibrary.on('changed',()=>{for(const contents of [mainWindow?.webContents,...[...projectViews.values()].map(v=>v.webContents)])if(contents&&!contents.isDestroyed())contents.send('editingLibrary:changed');});");p.write_text(s,encoding='utf8')
p=stage/'app/backend/main.py';p.write_text(p.read_text(encoding='utf8').replace('workflowVersion":27','workflowVersion":28'),encoding='utf8')
p=stage/'app/electron/python-bridge.js';p.write_text(p.read_text(encoding='utf8').replace('workflowVersion===27','workflowVersion===28'),encoding='utf8')
for name in ['electron/media-worker.js','shared/composition-runtime.cjs','backend/services/composition_audio.py']:
    assert (stage/'app'/name).read_bytes()==(base/'app'/name).read_bytes(),name
print(stage)
