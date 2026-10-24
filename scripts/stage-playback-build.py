"""Stage a scoped playback fix over the delivered v17, preserving the exporter."""
from pathlib import Path
import shutil
repo=Path(__file__).resolve().parents[1]
stage=repo/'dist/staging/playback-v18'
base=repo/'dist/staging/narration-v17'
shutil.copytree(base/'app',stage/'app',dirs_exist_ok=True)
shutil.copytree(base/'frontend',stage/'frontend',dirs_exist_ok=True,ignore=shutil.ignore_patterns('node_modules','.git'))
shutil.copytree(base/'shared',stage/'shared',dirs_exist_ok=True)
for name in ['components/TranscriptEditor.tsx','components/CompositionPlayer.tsx','hooks/useVideoSync.ts','hooks/useInstantAudio.ts','render/frameProvider.ts']:
    shutil.copy2(repo/'frontend/src'/name,stage/'frontend/src'/name)
for name in ['packaged-verification.js','playback-interaction-verification.js','narration-verification.js']:
    shutil.copy2(repo/'electron'/name,stage/'app/electron'/name)
for name in ['media-worker.js','render-worker-manager.js']:
    assert (stage/'app/electron'/name).read_bytes()==(base/'app/electron'/name).read_bytes()
print(stage)
