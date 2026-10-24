"""Stage v16 workflow/anchors while preserving the delivered v15 video decoder/shader."""
from pathlib import Path
import shutil
repo=Path(__file__).resolve().parents[1];stage=repo/'dist/staging/normal-flow-v16';base=repo/'dist/staging/agent-bridge-v15'
shutil.copytree(base/'app',stage/'app',dirs_exist_ok=True)
shutil.copytree(base/'frontend',stage/'frontend',dirs_exist_ok=True,ignore=shutil.ignore_patterns('node_modules','.git'))
for name in ['WorkspaceShell.tsx','vite-env.d.ts','lib/projectDefaults.ts','store/aiStore.ts','components/ProfileControls.tsx','components/ElementInspector.tsx','components/MediaPanel.tsx','components/CompositionTimeline.tsx','composition/types.ts','composition/timeMap.ts','composition/compiler.ts']:
    shutil.copy2(repo/'frontend/src'/name,stage/'frontend/src'/name)
shutil.copytree(repo/'shared',stage/'shared',dirs_exist_ok=True);shutil.copytree(repo/'shared',stage/'app/shared',dirs_exist_ok=True)
for name in ['main.js','preload.js','python-bridge.js','project-defaults.js','speech-membership.js','composition-migration.js','project-repository.js','project-store.js','external-agent-tools.js','processing-jobs.js','normal-flow-verification.js','packaged-verification.js']:
    shutil.copy2(repo/'electron'/name,stage/'app/electron'/name)
for name in ['main.py','requirements.txt','services/transcription.py','services/silence.py','services/cut_manifest.py','services/composition_models.py','services/project_models.py','services/composition_audio.py','vendor/auto_editor/edit.py','vendor/auto_editor/formats/json.py']:
    shutil.copy2(repo/'backend'/name,stage/'app/backend'/name)
assert (stage/'app/electron/media-worker.js').read_bytes()==(base/'app/electron/media-worker.js').read_bytes()
print(stage)
