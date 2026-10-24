"""Sample based mix used for preview fragments and immutable exports."""
import hashlib
import json
import tempfile
import wave
import threading
from functools import wraps
from uuid import uuid4
from contextlib import ExitStack
from pathlib import Path
import numpy as np
from .asset_preparation import CACHE, check, run, lease, evict, probe, pin
from .audio_join import join_audio_filter
from .composition_models import AudioPlan

RATE=48000
_locks_guard=threading.Lock()
_locks={}
def keyed_lock(key,job_id=''):
    with _locks_guard:
        entry=_locks.setdefault(key,[threading.Lock(),0]);entry[1]+=1
    class Lock:
        def __enter__(self):
            try:
                while not entry[0].acquire(timeout=.1):check(job_id)
                self.acquired=True;check(job_id)
            except BaseException:
                self.__exit__(None,None,None);raise
        def __exit__(self,*args):
            if getattr(self,'acquired',False):entry[0].release()
            with _locks_guard:
                entry[1]-=1
                if not entry[1]:_locks.pop(key,None)
    return Lock()
def serialize_mix(function):
    @wraps(function)
    def wrapped(*args,**kwargs):
        from inspect import signature
        bound=signature(function).bind(*args,**kwargs);bound.apply_defaults()
        data=dict(bound.arguments);job_id=data.pop('job_id','')
        key=hashlib.sha256(json.dumps(data,sort_keys=True).encode()).hexdigest()
        with keyed_lock(key,job_id):return function(*args,**kwargs)
    return wrapped
def gain(db):return 10**(db/20)

@serialize_mix
def render_audio(plan,assets,manifest,voice_path='',studio_sound=False,start_us=0,end_us=None,job_id='',include_voice=True):
    plan=AudioPlan.model_validate(plan).model_dump()
    end_us=min(plan['durationUs'],end_us if end_us is not None else plan['durationUs'])
    if end_us<=start_us:raise ValueError('Empty audio range')
    key=hashlib.sha256(json.dumps([plan,assets,manifest,voice_path,studio_sound,start_us,end_us,include_voice],sort_keys=True).encode()).hexdigest()
    CACHE.mkdir(parents=True,exist_ok=True);target=CACHE/f'{key}-mix.wav'
    if target.exists():lease([target]);return str(target)
    count=round((end_us-start_us)*RATE/1e6)
    with tempfile.TemporaryDirectory(prefix='edity_mix_') as directory, ExitStack() as mappings:
        directory=Path(directory);sources=[]
        if include_voice and voice_path and not plan['voiceMute']:
            source=voice_path
            if studio_sound:
                from .audio_cleaner import clean_audio
                source=clean_audio(source,str(directory/'voice-clean.wav'))
                check(job_id)
            info=probe(source,job_id)
            if manifest['keepSegments'] and any(s['codec_type']=='audio' for s in info['streams']):
                filters=[];labels=[];segments=manifest['keepSegments']
                for i,s in enumerate(segments):
                    a,b=float(s['start']),float(s['end']);labels.append(f'[v{i}]')
                    filters.append(f'[0:a]atrim=start={a:.6f}:end={b:.6f},asetpts=PTS-STARTPTS'+join_audio_filter(i,len(segments),b-a)+f'[v{i}]')
                filters.append(''.join(labels)+f'concat=n={len(labels)}:v=0:a=1,atrim=start={start_us/1e6:.6f}:end={end_us/1e6:.6f},asetpts=PTS-STARTPTS,apad,atrim=duration={(end_us-start_us)/1e6:.6f}[voice]')
                script=directory/'voice.ffscript';script.write_text(';'.join(filters),encoding='utf-8')
                pcm=directory/'voice.f32'
                run(['ffmpeg','-v','error','-y','-i',source,'-filter_complex_script',str(script),'-map','[voice]','-ac','2','-ar',str(RATE),'-f','f32le',str(pcm)],job_id)
                mapped=np.memmap(pcm,dtype='<f4',mode='r');mappings.callback(mapped._mmap.close)
                sources.append((None,mapped.reshape(-1,2),gain(plan['voiceGainDb'])))
        for e in plan['entries']:
            if e['mute'] or e['endUs']<=start_us or e['startUs']>=end_us:continue
            asset=assets[e['assetId']];file=asset['path'];stat=Path(file).stat()
            digest=hashlib.sha256(json.dumps([asset.get('hash'),str(file),stat.st_size,stat.st_mtime_ns,e['sourceInUs'],RATE]).encode()).hexdigest();pcm=CACHE/f'{digest}-source.f32'
            available=max(0,(asset['durationUs']-e['sourceInUs'])/1e6)
            if not asset['hasAudio'] or available<=0:continue
            # Decode the remaining source once; loop/trim/hold are resolved by sample indices.
            mappings.enter_context(pin([pcm]))
            with keyed_lock(str(pcm),job_id):
                if not pcm.exists():
                    pending=pcm.with_name(f'{pcm.name}.{uuid4()}.partial')
                    try:
                        run(['ffmpeg','-v','error','-y','-ss',str(e['sourceInUs']/1e6),'-i',file,'-vn','-ac','2','-ar',str(RATE),'-f','f32le',str(pending)],job_id)
                        check(job_id);pending.replace(pcm)
                    finally:pending.unlink(missing_ok=True)
            if not pcm.stat().st_size:continue
            mapped=np.memmap(pcm,dtype='<f4',mode='r');mappings.callback(mapped._mmap.close);samples=mapped.reshape(-1,2)
            sources.append((e,samples,gain(e['gainDb'])))
        partial=target.with_name(f'{target.stem}-{uuid4()}.partial.wav')
        points=plan['duckEnvelope'];times=np.array([p['timeUs']/1e6 for p in points]);values=np.array([p['gain'] for p in points])
        try:
            with wave.open(str(partial),'wb') as out:
                out.setnchannels(2);out.setsampwidth(3);out.setframerate(RATE)
                for offset in range(0,count,RATE):
                    check(job_id);n=min(RATE,count-offset);mix=np.zeros((n,2),dtype=np.float64);absolute=np.arange(offset,offset+n)+round(start_us*RATE/1e6)
                    for e,samples,volume in sources:
                        if e is None:
                            portion=samples[offset:offset+n];mix[:len(portion)]+=portion*volume;continue
                        relative=absolute-round(e['startUs']*RATE/1e6);length=round((e['endUs']-e['startUs'])*RATE/1e6)
                        valid=(relative>=0)&(relative<length)
                        phase=relative+round(e.get('sourcePhaseUs',0)*RATE/1e6)
                        if e['endPolicy']!='loop':valid&=phase<len(samples)
                        indices=phase[valid]%len(samples);vol=np.full(len(indices),volume)
                        logical_length=round(e['activeDurationUs']*RATE/1e6) if e.get('activeDurationUs') is not None else length
                        envelope_phase=relative+round((e['envelopePhaseUs'] if e.get('envelopePhaseUs') is not None else e.get('sourcePhaseUs',0))*RATE/1e6)
                        if e['fadeInUs']:vol*=np.clip(envelope_phase[valid]/(e['fadeInUs']*RATE/1e6),0,1)
                        if e['fadeOutUs']:vol*=np.clip((logical_length-envelope_phase[valid])/(e['fadeOutUs']*RATE/1e6),0,1)
                        if e['ducking']:vol*=np.interp(absolute[valid]/RATE,times,values,left=1,right=1)
                        mix[valid]+=samples[indices]*vol[:,None]
                    # Fixed gain and fixed clipping rule, independent of the number of tracks.
                    integer=np.round(np.clip(mix*gain(plan['masterGainDb']),-1,1)*8388607).astype('<i4')
                    out.writeframes(integer.view(np.uint8).reshape(-1,4)[:,:3].tobytes())
            check(job_id);partial.replace(target)
        finally:partial.unlink(missing_ok=True)
    lease([target]);evict();return str(target)
