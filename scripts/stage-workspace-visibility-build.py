"""Visibility ownership fix over delivered v40; preserve render/export code."""
from pathlib import Path
import shutil,sys
r=Path(__file__).resolve().parents[1];b=r/'dist/staging/export-performance-v40'
baseline='--baseline' in sys.argv
s=r/('dist/staging/workspace-visibility-v41-baseline' if baseline else 'dist/staging/workspace-visibility-v41')
for folder in ['app','frontend','shared']:
 shutil.copytree(b/folder,s/folder,dirs_exist_ok=True,ignore=shutil.ignore_patterns('node_modules','.git') if folder=='frontend' else None)
files=['workspace-visibility-verification.js','workspace-recovery-verification.js']
if not baseline:
 files+=['main.js','preload.js','workspace-layout.js']
 for name in ['WorkspaceShell.tsx','vite-env.d.ts']:shutil.copy2(r/'frontend/src'/name,s/'frontend/src'/name)
for name in files:shutil.copy2(r/'electron'/name,s/'app/electron'/name)
p=s/'app/electron/packaged-verification.js';t=p.read_text('utf8').replace(" if(process.env.EDITY_TEST_EXPORT_PERFORMANCE", " if(process.env.EDITY_TEST_WORKSPACE_VISIBILITY==='1'){await require('./workspace-visibility-verification')({app,win,api,until,report});report.passed=true;return;}\n if(process.env.EDITY_TEST_EXPORT_PERFORMANCE",1);p.write_text(t,'utf8')
for name in ['app/electron/media-worker.js','app/electron/media-render-pipeline.js','app/shared/render-compositor.cjs','frontend/src/components/CompositionPlayer.tsx','frontend/src/render/compositor.ts']:
 assert (s/name).read_bytes()==(b/name).read_bytes(),name
print(s)
