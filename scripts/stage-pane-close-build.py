"""Stage the pane close control over the delivered playback-v18 build."""
from pathlib import Path
import shutil

repo = Path(__file__).resolve().parents[1]
base = repo / 'dist/staging/playback-v18'
stage = repo / 'dist/staging/pane-close-v19'
for folder in ['app', 'frontend', 'shared']:
    shutil.copytree(base / folder, stage / folder, dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns('node_modules', '.git') if folder == 'frontend' else None)
for name in ['App.tsx', 'WorkspaceShell.tsx', 'vite-env.d.ts']:
    shutil.copy2(repo / 'frontend/src' / name, stage / 'frontend/src' / name)
for name in ['main.js', 'preload.js', 'packaged-verification.js', 'pane-close-verification.js']:
    shutil.copy2(repo / 'electron' / name, stage / 'app/electron' / name)
print(stage)
