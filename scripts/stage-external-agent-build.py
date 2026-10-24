"""Layer the shared external bridge over the verified v14 renderer/decoder."""
from pathlib import Path
import shutil
repo=Path(__file__).resolve().parents[1]
stage=repo/'dist/staging/agent-bridge-v15'
baseline=repo/'dist/staging/chat-vision-v14/app'
shutil.copytree(baseline,stage/'app',dirs_exist_ok=True)
shutil.copytree(baseline/'shared',stage/'shared',dirs_exist_ok=True)
frontend=stage/'frontend'
shutil.copytree(repo/'dist/staging/chat-vision-v13/frontend',frontend,dirs_exist_ok=True,ignore=shutil.ignore_patterns('node_modules','.git'))
for name in ['WorkspaceShell.tsx','vite-env.d.ts']:
    shutil.copy2(repo/'frontend/src'/name,frontend/'src'/name)
for name in ['main.js','preload.js','media-edit-orchestrator.js','media-action-dispatcher.js','local-agent-bridge.js','agent-state-store.js','external-agent-tools.js','reconciled-transcript.js','processing-jobs.js','project-store.js','project-repository.js','job-coordinator.js']:
    shutil.copy2(repo/'electron'/name,stage/'app/electron'/name)
shutil.copy2(repo/'backend/routers/composition.py',stage/'app/backend/routers/composition.py')
shutil.copy2(repo/'backend/job_worker.py',stage/'app/backend/job_worker.py')
assert (stage/'app/electron/media-worker.js').read_bytes()==(baseline/'electron/media-worker.js').read_bytes()
print(stage)
