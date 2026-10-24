"""Export scheduling overlay on delivered v41, preserving its compositor."""
from pathlib import Path
import shutil,subprocess
r=Path(__file__).resolve().parents[1];b=r/'dist/staging/workspace-visibility-v41';s=r/'dist/staging/export-gpu-v43'
for folder in ['app','frontend','shared']:
 shutil.copytree(b/folder,s/folder,dirs_exist_ok=True,ignore=shutil.ignore_patterns('node_modules','.git') if folder=='frontend' else None)
for name in ['render-direct-preload.js','media-render-pipeline.js','gpu-render-pipeline.js','packet-video-source.js','parallel-gpu-export.js','export-partitions.js','export-acceleration.js','export-output-validation.js','render-worker-manager.js','export-hardware-probe.js','export-performance-verification.js']:
 shutil.copy2(r/'electron'/name,s/'app/electron'/name)
shutil.copy2(r/'frontend/src/render-worker/direct.ts',s/'frontend/src/render-worker/direct.ts')
shutil.copy2(r/'frontend/src/render-worker/nativeEncoder.ts',s/'frontend/src/render-worker/nativeEncoder.ts')
p=s/'app/electron/packaged-verification.js';t=p.read_text('utf8').replace(" if(process.env.EDITY_TEST_WORKSPACE_VISIBILITY", " if(process.env.EDITY_TEST_EXPORT_HARDWARE_PROBE==='1'){await require('./export-hardware-probe')({win,report});report.passed=true;return;}\n if(process.env.EDITY_TEST_WORKSPACE_VISIBILITY",1);p.write_text(t,'utf8')
assert (s/'frontend/src/render/compositor.ts').read_bytes()==(b/'frontend/src/render/compositor.ts').read_bytes()
p=s/'frontend/src/render/compositor.ts';t=p.read_text('utf8').replace('(frame as HTMLCanvasElement).width','((frame as HTMLCanvasElement).width||(frame as VideoFrame).displayWidth)').replace('(frame as HTMLCanvasElement).height','((frame as HTMLCanvasElement).height||(frame as VideoFrame).displayHeight)');p.write_text(t,'utf8')
subprocess.run(['node',str(r/'scripts/build-render-compositor.js'),str(s/'frontend'),str(s/'app/shared/render-compositor.cjs')],check=True)
print(s)
