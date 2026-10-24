"""Bounded full-band, all-channel peak envelopes for visible timeline windows."""
import math
import re
from functools import lru_cache
from .asset_preparation import run,probe

@lru_cache(maxsize=96)
def waveform(path,modified,size,start_us=0,end_us=None,bins=2000):
    info=probe(path)
    duration=float(info.get('format',{}).get('duration') or 0)
    if not any(s.get('codec_type')=='audio' for s in info.get('streams',[])):
        return {'duration':duration,'peaks':[],'startUs':start_us,'endUs':start_us,'binUs':1}
    start=max(0,min(duration,start_us/1e6));end=min(duration,end_us/1e6 if end_us is not None else duration)
    if end<=start:return {'duration':duration,'peaks':[],'startUs':round(start*1e6),'endUs':round(start*1e6),'binUs':1}
    samples=max(1,math.ceil((end-start)*48000/max(1,min(4096,bins))))
    # Taking peaks after downsampling to 200 Hz erased most speech/music. Keep
    # the full audio band and measure the maximum across channels, not a mono sum.
    filters=f'atrim=duration={end-start:.6f},aresample=48000,aformat=sample_fmts=flt,asetnsamples=n={samples}:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.Peak_level:file=-'
    raw=run(['ffmpeg','-v','error','-ss',f'{start:.6f}','-i',path,'-t',f'{end-start:.6f}','-map','0:a:0','-vn','-af',filters,'-f','null','-'],timeout=120).decode(errors='replace')
    peaks=[]
    for value in re.findall(r'lavfi.astats.Overall.Peak_level=([^\s]+)',raw):
        db=float(value);peaks.append(round(min(1,10**(db/20)) if math.isfinite(db) else 0,6))
    return {'duration':duration,'startUs':round(start*1e6),'endUs':round(end*1e6),'binUs':samples/48000*1e6,'peaks':peaks}
