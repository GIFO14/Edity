"""Stage narration v17 over the verified v16 render/ASR build."""
from pathlib import Path
import shutil
repo=Path(__file__).resolve().parents[1];stage=repo/'dist/staging/narration-v17';base=repo/'dist/staging/normal-flow-v16'
shutil.copytree(base/'app',stage/'app',dirs_exist_ok=True);shutil.copytree(base/'frontend',stage/'frontend',dirs_exist_ok=True,ignore=shutil.ignore_patterns('node_modules','.git'))
for name in ['vite-env.d.ts','components/NarrationControls.tsx','components/TranscriptEditor.tsx','components/ProfileControls.tsx','components/VideoPlayer.tsx','composition/narration.ts','composition/runtime.ts','composition/types.ts','composition/timeMap.ts','composition/manifestClient.ts','hooks/useInstantAudio.ts','hooks/useKeyboardShortcuts.ts','lib/instantTimeline.ts','lib/playbackTime.ts','lib/projectPersistence.ts','store/editorStore.ts','types/project.ts']:
    shutil.copy2(repo/'frontend/src'/name,stage/'frontend/src'/name)
for name in ['main.js','preload.js','python-bridge.js','narration-commands.js','manifest-request.js','project-repository.js','project-store.js','external-agent-tools.js','media-action-dispatcher.js','packaged-verification.js','narration-verification.js']:
    shutil.copy2(repo/'electron'/name,stage/'app/electron'/name)
for name in ['main.py','routers/preview.py','services/cut_manifest.py','services/project_models.py','services/media_actions.py']:
    shutil.copy2(repo/'backend'/name,stage/'app/backend'/name)
shutil.copytree(repo/'shared',stage/'shared',dirs_exist_ok=True);shutil.copytree(repo/'shared',stage/'app/shared',dirs_exist_ok=True)
assert (stage/'app/electron/media-worker.js').read_bytes()==(base/'app/electron/media-worker.js').read_bytes()
print(stage)
