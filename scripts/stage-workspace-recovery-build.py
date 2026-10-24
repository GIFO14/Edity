"""Workspace lifecycle overlay on delivered seek-recovery-v38."""
from pathlib import Path
import shutil
r=Path(__file__).resolve().parents[1];b=r/'dist/staging/seek-recovery-v38';s=r/'dist/staging/workspace-recovery-v39'
for folder in ['app','frontend','shared']:
 shutil.copytree(b/folder,s/folder,dirs_exist_ok=True,ignore=shutil.ignore_patterns('node_modules','.git') if folder=='frontend' else None)
for name in ['WorkspaceShell.tsx','vite-env.d.ts']:shutil.copy2(r/'frontend/src'/name,s/'frontend/src'/name)
for name in ['main.js','preload.js','workspace-reopen-verification.js']:shutil.copy2(r/'electron'/name,s/'app/electron'/name)
p=s/'app/electron/packaged-verification.js';t=p.read_text('utf8');t=t.replace(" if(process.env.EDITY_TEST_SEEK_RECOVERY", " if(process.env.EDITY_TEST_WORKSPACE_REOPEN==='1'){await require('./workspace-reopen-verification')({app,win,api,until,report});report.passed=true;return;}\n if(process.env.EDITY_TEST_SEEK_RECOVERY",1);p.write_text(t,'utf8')
for name in ['src/render/compositor.ts','src/render/frameProvider.ts','src/components/CompositionPlayer.tsx','src/components/CompositionTimeline.tsx','src/hooks/useInstantAudio.ts']:
 assert (s/'frontend'/name).read_bytes()==(b/'frontend'/name).read_bytes(),name
print(s)
