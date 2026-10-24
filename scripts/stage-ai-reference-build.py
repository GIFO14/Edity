"""Build this change over the delivered v11 renderer/decoder baseline."""
from pathlib import Path
import shutil
import re

repo=Path(__file__).resolve().parents[1]
stage=repo/'dist/staging/ai-reference-v12'
frontend=stage/'frontend'
frontend.mkdir(parents=True,exist_ok=True)
for name in ['src','public']:
    if (repo/'frontend'/name).exists():shutil.copytree(repo/'frontend'/name,frontend/name,dirs_exist_ok=True)
for name in ['package.json','package-lock.json','tsconfig.json','tsconfig.app.json','tsconfig.node.json','vite.config.ts','index.html','render-worker.html','postcss.config.js','tailwind.config.js']:
    source=repo/'frontend'/name
    if source.exists():shutil.copy2(source,frontend/name)
shutil.copytree(repo/'shared',stage/'shared',dirs_exist_ok=True)
# Keep the delivered transition shader; the working tree's alternate kernel is
# a separate native-parity experiment and is not part of this release.
stable=(repo/'dist/staging/cut-margin-v10/frontend/src/render/compositor.ts').read_text(encoding='utf8')
target=frontend/'src/render/compositor.ts'
source=target.read_text(encoding='utf8')
pattern=r'const transitionFragment=`[\s\S]*?`;'
shader=re.search(pattern,stable).group(0)
source=re.sub(pattern,lambda m:shader,source,count=1)
target.write_text(source,encoding='utf8')
print(frontend)
