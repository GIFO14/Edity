"""Install the pinned portable Windows RIFE runtime, fetching only selected ZIP ranges."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
from urllib.request import Request, urlopen
import zipfile

PROJECT = Path(__file__).resolve().parents[1]

class RemoteZip(io.RawIOBase):
    def __init__(self, url, size):self.url,self.size,self.position=url,size,0
    def seek(self, offset, whence=0):
        self.position=offset if whence==0 else self.position+offset if whence==1 else self.size+offset
        return self.position
    def tell(self):return self.position
    def seekable(self):return True
    def read(self, size=-1):
        size=self.size-self.position if size<0 else min(size,self.size-self.position)
        if size<=0:return b''
        request=Request(self.url,headers={'Range':f'bytes={self.position}-{self.position+size-1}'})
        with urlopen(request,timeout=60) as response:
            if response.status!=206:raise RuntimeError('Download server did not support bounded range requests')
            data=response.read(size+1)
        if len(data)!=size:raise RuntimeError('Incomplete runtime download')
        self.position+=len(data)
        return data

def install(destination):
    manifest=json.loads((PROJECT/'resources/rife-runtime.json').read_text('utf-8'))
    destination=Path(destination).resolve()
    if all((destination/name).is_file() and hashlib.sha256((destination/name).read_bytes()).hexdigest()==digest for name,digest in manifest['files'].items()):
        print('Pinned RIFE runtime already installed');return
    # Verify every selected byte before touching the installed runtime.
    with zipfile.ZipFile(RemoteZip(manifest['url'],manifest['archiveBytes'])) as archive:
        files={name:archive.read(manifest['prefix']+name) for name in manifest['files']}
    for name,data in files.items():
        if hashlib.sha256(data).hexdigest()!=manifest['files'][name]:raise RuntimeError(f'Runtime checksum mismatch: {name}')
    destination.mkdir(parents=True,exist_ok=True)
    for name,data in files.items():
        target=destination/name;target.parent.mkdir(parents=True,exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=target.parent,delete=False) as temporary:
            temporary.write(data);pending=Path(temporary.name)
        try:os.replace(pending,target)
        finally:pending.unlink(missing_ok=True)
    (destination/'runtime.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    print(json.dumps({'destination':str(destination),'model':manifest['model'],'installedBytes':sum(map(len,files.values()))}))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--destination',default=str(PROJECT/'resources/rife'))
    install(parser.parse_args().destination)
