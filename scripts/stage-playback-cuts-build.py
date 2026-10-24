"""Scoped playback, cut provenance and acoustic review build on pane-close-v19."""
from pathlib import Path
import shutil

repo = Path(__file__).resolve().parents[1]
base = repo / 'dist/staging/pane-close-v19'
stage = repo / 'dist/staging/playback-cuts-v20'
for folder in ['app', 'frontend', 'shared']:
    shutil.copytree(base / folder, stage / folder, dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns('node_modules', '.git') if folder == 'frontend' else None)
for name in ['App.tsx','components/TranscriptEditor.tsx', 'components/CompositionPlayer.tsx',
             'components/CompositionTimeline.tsx', 'components/AIPanel.tsx', 'components/AudioPanel.tsx',
             'render/frameProvider.ts', 'types/project.ts', 'hooks/useInstantAudio.ts','hooks/useCompositionAudio.ts',
             'hooks/useVideoSync.ts','lib/projectPersistence.ts','store/compositionStore.ts']:
    shutil.copy2(repo / 'frontend/src' / name, stage / 'frontend/src' / name)
for name in ['media-action-dispatcher.js','external-agent-tools.js','media-capabilities.js',
             'processing-jobs.js','python-bridge.js','playback-interaction-verification.js']:
    shutil.copy2(repo / 'electron' / name, stage / 'app/electron' / name)
for name in ['main.py','job_worker.py','services/ai_provider.py','services/media_actions.py',
             'services/cut_refinement.py','services/sound_events.py','services/audio_gaps.py','services/silence.py','routers/ai.py']:
    shutil.copy2(repo / 'backend' / name, stage / 'app/backend' / name)
for name in ['edit-boundaries.mjs','edit-boundaries.d.mts','project-schema.json']:
    for target in [stage/'shared',stage/'app/shared']:
        shutil.copy2(repo/'shared'/name,target/name)
print(stage)
