"""Taller timeline, waves and direct fades over delivered music-fidelity-v29."""
from pathlib import Path
import shutil
repo=Path(__file__).resolve().parents[1]
base=repo/'dist/staging/music-fidelity-v29';stage=repo/'dist/staging/timeline-workspace-v30'
for folder in ['app','frontend','shared']:
    shutil.copytree(base/folder,stage/folder,dirs_exist_ok=True,ignore=shutil.ignore_patterns('node_modules','.git') if folder=='frontend' else None)
for name in ['components/VideoPlayer.tsx','components/CompositionTimeline.tsx','components/TimelineWaveform.tsx','components/TimelineOverview.tsx','composition/timelineLayout.ts','store/compositionStore.ts']:
    shutil.copy2(repo/'frontend/src'/name,stage/'frontend/src'/name)
# Preserve independently unshipped rendering changes in the root player.
p=stage/'frontend/src/components/CompositionPlayer.tsx';s=(base/'frontend/src/components/CompositionPlayer.tsx').read_text(encoding='utf8').replace('captionsPreview,colorPreview}', 'captionsPreview,colorPreview,timelineGesture}').replace('useCompositionAudio(videoRef,visible?plan:null);','useCompositionAudio(videoRef,visible&&!timelineGesture?plan:null);');p.write_text(s,encoding='utf8')
for name in ['main.py','routers/audio.py','services/waveform.py']:
    shutil.copy2(repo/'backend'/name,stage/'app/backend'/name)
for name in ['python-bridge.js','packaged-verification.js','timeline-workspace-verification.js']:
    shutil.copy2(repo/'electron'/name,stage/'app/electron'/name)
for name in ['electron/media-worker.js','shared/composition-runtime.cjs','backend/services/composition_audio.py']:
    assert (stage/'app'/name).read_bytes()==(base/'app'/name).read_bytes()
print(stage)
