"""Export/persistence overlay; preserve delivered compositor and decoder semantics."""
from pathlib import Path
import shutil
import subprocess
r=Path(__file__).resolve().parents[1];b=r/'dist/staging/workspace-recovery-v39';s=r/'dist/staging/export-performance-v40'
for folder in ['app','frontend','shared']:
 shutil.copytree(b/folder,s/folder,dirs_exist_ok=True,ignore=shutil.ignore_patterns('node_modules','.git') if folder=='frontend' else None)
files=['job-coordinator.js','job-state-writer.js','media-render-pipeline.js','export-frame-selection.js','render-direct-preload.js','render-direct.html','render-worker-manager.js','export-performance-verification.js']
for name in files:shutil.copy2(r/'electron'/name,s/'app/electron'/name)
shutil.copy2(r/'frontend/src/render-worker/direct.ts',s/'frontend/src/render-worker/direct.ts')
p=s/'app/electron/packaged-verification.js';t=p.read_text('utf8').replace(" if(process.env.EDITY_TEST_WORKSPACE_REOPEN", " if(process.env.EDITY_TEST_EXPORT_PERFORMANCE==='1'){await require('./export-performance-verification')({win,api,until,report});report.passed=true;return;}\n if(process.env.EDITY_TEST_WORKSPACE_REOPEN",1);p.write_text(t,'utf8')
for name in ['frontend/src/render/compositor.ts','app/electron/media-worker.js','app/electron/decoder-input.js','app/shared/color-decode.cjs']:
 assert (s/name).read_bytes()==(b/name).read_bytes(),name
subprocess.run(['node',str(r/'scripts/build-render-compositor.js'),str(s/'frontend'),str(s/'app/shared/render-compositor.cjs')],check=True)
print(s)
