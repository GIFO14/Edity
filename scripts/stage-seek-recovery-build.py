"""Seek recovery overlay on the last delivered playback-performance-v37 build."""
from pathlib import Path
import shutil
repo=Path(__file__).resolve().parents[1]
base=repo/'dist/staging/playback-performance-v37';stage=repo/'dist/staging/seek-recovery-v38'
for folder in ['app','frontend','shared']:
    shutil.copytree(base/folder,stage/folder,dirs_exist_ok=True,ignore=shutil.ignore_patterns('node_modules','.git') if folder=='frontend' else None)
for name in ['components/CompositionPlayer.tsx','render/frameProvider.ts','render/abortable.ts']:
    shutil.copy2(repo/'frontend/src'/name,stage/'frontend/src'/name)
shutil.copy2(repo/'electron/seek-recovery-verification.js',stage/'app/electron/seek-recovery-verification.js')
shutil.copy2(repo/'electron/color-grading-verification.js',stage/'app/electron/color-grading-verification.js')
p=stage/'app/electron/packaged-verification.js'
s=p.read_text('utf-8').replace(" if(process.env.EDITY_TEST_TIMELINE_WIDTH", " if(process.env.EDITY_TEST_SEEK_RECOVERY==='1'){await require('./seek-recovery-verification')({win,api,until,report});report.passed=true;return;}\n if(process.env.EDITY_TEST_TIMELINE_WIDTH",1)
p.write_text(s,'utf-8')
for name in ['electron/media-worker.js','shared/composition-runtime.cjs','backend/services/composition_audio.py','electron/external-agent-tools.js']:
    assert (stage/'app'/name).read_bytes()==(base/'app'/name).read_bytes(),name
for name in ['render/compositor.ts','hooks/useInstantAudio.ts','hooks/useCompositionAudio.ts','components/CompositionTimeline.tsx']:
    assert (stage/'frontend/src'/name).read_bytes()==(base/'frontend/src'/name).read_bytes(),name
print(stage)
