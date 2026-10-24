"""Locked base cut pieces and resilient workspace over timeline-scrub-v23."""
from pathlib import Path
import shutil
repo=Path(__file__).resolve().parents[1]
base=repo/'dist/staging/timeline-scrub-v23';stage=repo/'dist/staging/base-cuts-v24'
for folder in ['app','frontend','shared']:
    shutil.copytree(base/folder,stage/folder,dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns('node_modules','.git') if folder=='frontend' else None)
for name in ['components/CompositionTimeline.tsx','components/ViewerManipulationLayer.tsx','components/EditorErrorBoundary.tsx','WorkspaceShell.tsx','main.tsx']:
    shutil.copy2(repo/'frontend/src'/name,stage/'frontend/src'/name)
# Carry only this task's IPC and view lifecycle changes into the scoped main.
source=(repo/'electron/main.js').read_text(encoding='utf8')
target=stage/'app/electron/main.js';text=target.read_text(encoding='utf8')
start='let workspacePanes = []';end='\nconst isDev ='
helpers=source[source.index(start):source.index(end)]
text=text.replace(end,'\n'+helpers+end,1)
start='  const shellFailures=[];';end="\n  mainWindow.on('closed'"
text=text.replace(end,'\n'+source[source.index(start):source.index(end)]+end,1)
start="ipcMain.handle('workspace:openView'";end="ipcMain.handle('workspace:requestClose'"
text=text[:text.index(start)]+source[source.index(start):source.index(end)]+text[text.index(end):]
text=text.replace('event.sender===editor?.webContents)return;','event.sender===editor?.webContents||closingProjectViews.get(event.sender.id)===id)return;',1)
target.write_text(text,encoding='utf8')
target=stage/'app/electron/preload.js';text=target.read_text(encoding='utf8');marker='  onWorkspaceOpenProject:'
# Preload and frontend API declarations are likewise scoped.
source=(repo/'electron/preload.js').read_text(encoding='utf8')
text=text.replace(marker,source[source.index('  onWorkspaceViewState:'):source.index(marker)]+marker,1);target.write_text(text,encoding='utf8')
target=stage/'frontend/src/vite-env.d.ts';text=target.read_text(encoding='utf8')
source=(repo/'frontend/src/vite-env.d.ts').read_text(encoding='utf8');start='  onWorkspaceViewState:';end='  getNarration:'
text=text.replace(end,source[source.index(start):source.index(end)]+end,1);target.write_text(text,encoding='utf8')
for name in ['edit-boundaries.mjs','edit-boundaries.d.mts']:
    for folder in ['shared','app/shared']:shutil.copy2(repo/'shared'/name,stage/folder/name)
for name in ['packaged-verification.js','base-cuts-verification.js','workspace-recovery-verification.js']:
    shutil.copy2(repo/'electron'/name,stage/'app/electron'/name)
print(stage)
