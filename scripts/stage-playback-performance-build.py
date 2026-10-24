"""Remove timeline waveform work from playback over delivered timeline-width-v36."""
from pathlib import Path
import shutil
repo=Path(__file__).resolve().parents[1]
base=repo/'dist/staging/timeline-width-v36';stage=repo/'dist/staging/playback-performance-v37'
for folder in ['app','frontend','shared']:
    shutil.copytree(base/folder,stage/folder,dirs_exist_ok=True,ignore=shutil.ignore_patterns('node_modules','.git') if folder=='frontend' else None)
for name in ['CompositionTimeline.tsx','TimelineWaveform.tsx','TimelinePlayhead.tsx']:
    shutil.copy2(repo/'frontend/src/components'/name,stage/'frontend/src/components'/name)
for name in ['electron/media-worker.js','shared/composition-runtime.cjs','backend/services/composition_audio.py','electron/external-agent-tools.js']:
    assert (stage/'app'/name).read_bytes()==(base/'app'/name).read_bytes(),name
for name in ['CompositionPlayer.tsx','VideoPlayer.tsx']:
    assert (stage/'frontend/src/components'/name).read_bytes()==(base/'frontend/src/components'/name).read_bytes(),name
assert (stage/'frontend/src/render/compositor.ts').read_bytes()==(base/'frontend/src/render/compositor.ts').read_bytes()
print(stage)
