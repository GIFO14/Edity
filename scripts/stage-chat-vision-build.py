"""Stage attachment/vision changes over the delivered v12 renderer and decoder."""
from pathlib import Path
import shutil
import re
import argparse

repo=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--release',default='chat-vision-v14')
args=parser.parse_args()
if not re.fullmatch(r'chat-vision-v\d+',args.release):parser.error('Expected chat-vision-v<number>')
stage=repo/'dist/staging'/args.release
baseline=repo/'dist/staging/ai-reference-v12'
stage.mkdir(parents=True,exist_ok=True)
shutil.copytree(baseline/'app',stage/'app',dirs_exist_ok=True)
frontend=stage/'frontend'
frontend.mkdir(parents=True,exist_ok=True)
for name in ['src','public']:
    shutil.copytree(repo/'frontend'/name,frontend/name,dirs_exist_ok=True)
for name in ['package.json','package-lock.json','tsconfig.json','tsconfig.app.json','tsconfig.node.json','vite.config.ts','index.html','render-worker.html','postcss.config.js','tailwind.config.js']:
    source=repo/'frontend'/name
    if source.exists():shutil.copy2(source,frontend/name)
shutil.copytree(repo/'shared',stage/'shared',dirs_exist_ok=True)
stable=(baseline/'frontend/src/render/compositor.ts').read_text(encoding='utf8')
target=frontend/'src/render/compositor.ts'
source=target.read_text(encoding='utf8')
pattern=r'const transitionFragment=`[\s\S]*?`;'
shader=re.search(pattern,stable).group(0)
target.write_text(re.sub(pattern,lambda m:shader,source,count=1),encoding='utf8')
for name in ['main.js','preload.js','chat-attachments.js','media-edit-orchestrator.js','media-capabilities.js','media-jobs.js','project-archive.js','project-store.js','packaged-verification.js','chat-vision-verification.js','real-resource-vision-verification.js','decoder-input.js']:
    shutil.copy2(repo/'electron'/name,stage/'app/electron'/name)
for name in ['ai_references.py','media_actions.py']:
    shutil.copy2(repo/'backend/services'/name,stage/'app/backend/services'/name)
shutil.copy2(repo/'backend/routers/composition.py',stage/'app/backend/routers/composition.py')
shutil.copy2(repo/'backend/requirements.txt',stage/'app/backend/requirements.txt')
shutil.copy2(repo/'shared/media-action-schema.json',stage/'app/shared/media-action-schema.json')
# Apply only the verified still-image fix to the delivered decoder. Preserve
# the delivered video timing; source frame-rate experiments remain separate.
worker=(baseline/'app/electron/media-worker.js').read_text(encoding='utf8')
worker=worker.replace("const { locateTool } = require('./ffmpeg-paths');", "const { locateTool } = require('./ffmpeg-paths');\nconst {decoderInputArgs}=require('./decoder-input');",1)
old="this.session = run(['-v','error','-threads','1','-ss',String(frame/this.fps),'-i',asset.normalizedPath||asset.path,'-an','-vf',`scale=${width}:${height}:flags=bicubic,fps=${this.fps}`,'-pix_fmt','rgba','-f','rawvideo','pipe:1']);"
assert worker.count(old)==1
worker=worker.replace(old,'this.session = run(decoderInputArgs(asset,{width,height,fps:this.fps,frame}));',1)
(stage/'app/electron/media-worker.js').write_text(worker,encoding='utf8')
print(stage)
